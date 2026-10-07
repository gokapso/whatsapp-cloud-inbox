import type { KapsoMessageExtensions, MediaData, MetaMessage } from '@kapso/whatsapp-cloud-api';
import type { DeliveryError, Message } from './inbox-data';

type MessageTypeData = {
  filename?: string;
  mimeType?: string;
  messageId?: string;
};

type WithOptionalTimestamp = {
  lastMessageTimestamp?: unknown;
};

function toIsoString(timestamp: unknown, fallback?: unknown): string {
  const coerceToNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const num = Number(value);
      if (Number.isFinite(num)) {
        return num;
      }
    }
    return null;
  };

  const epochSeconds = coerceToNumber(timestamp);
  if (epochSeconds !== null) {
    return new Date(epochSeconds * 1000).toISOString();
  }

  if (typeof fallback === 'string' && !Number.isNaN(Date.parse(fallback))) {
    return new Date(fallback).toISOString();
  }

  return new Date().toISOString();
}

function normaliseKapsoContent(content: KapsoMessageExtensions['content']): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && 'text' in content) {
    const maybeText = (content as { text?: unknown }).text;
    if (typeof maybeText === 'string') return maybeText;
  }
  return undefined;
}

function extractMessageTypeData(value: KapsoMessageExtensions['messageTypeData']): MessageTypeData | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const { filename, mimeType, messageId } = value as MessageTypeData;
  return {
    filename: typeof filename === 'string' ? filename : undefined,
    mimeType: typeof mimeType === 'string' ? mimeType : undefined,
    messageId: typeof messageId === 'string' ? messageId : undefined
  };
}

function extractMediaData(mediaData: MediaData | undefined): Pick<MediaData, 'filename' | 'contentType' | 'byteSize'> {
  return {
    filename: typeof mediaData?.filename === 'string' ? mediaData.filename : undefined,
    contentType: typeof mediaData?.contentType === 'string' ? mediaData.contentType : undefined,
    byteSize: typeof mediaData?.byteSize === 'number' ? mediaData.byteSize : undefined
  };
}

function readString(value: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!value) return undefined;

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function extractContextMessageId(
  msg: MetaMessage,
  kapsoExtensions: KapsoMessageExtensions | undefined,
  messageTypeData: MessageTypeData | undefined
): string | undefined {
  return (
    (typeof msg.context?.id === 'string' && msg.context.id) ||
    readString(kapsoExtensions, 'contextMessageId', 'context_message_id') ||
    readString(messageTypeData, 'contextMessageId', 'context_message_id')
  );
}

function isGeneratedMediaAttachmentContent(content: string, mediaUrl?: string): boolean {
  const trimmedContent = content.trim();
  if (!trimmedContent) return false;
  if (mediaUrl && trimmedContent === mediaUrl.trim()) return true;
  if (/^https?:\/\//i.test(trimmedContent)) return true;
  if (/\bURL:\s*https?:\/\//i.test(trimmedContent)) return true;
  return /^(image|audio)\s+attached\b/i.test(trimmedContent);
}

function extractTranscriptContent(content: string): string | undefined {
  const match = content.match(/\bTranscript:\s*[\s\S]*$/i);
  if (!match) return undefined;

  return match[0]
    .replace(/\s+\bURL:\s*https?:\/\/\S+[\s\S]*$/i, '')
    .trim();
}

function normalizeMessageContent(input: {
  content?: string;
  messageType: string;
  mediaUrl?: string;
}): string {
  if (!input.content) return '';

  if (input.messageType === 'audio') {
    return extractTranscriptContent(input.content) ??
      (isGeneratedMediaAttachmentContent(input.content, input.mediaUrl) ? '' : input.content);
  }

  if (
    input.messageType === 'image' &&
    isGeneratedMediaAttachmentContent(input.content, input.mediaUrl)
  ) {
    return '';
  }

  return input.content;
}

function extractDeliveryError(kapso?: KapsoMessageExtensions): DeliveryError | undefined {
  const statuses = Array.isArray(kapso?.statuses) ? kapso.statuses as Array<{ status?: string; errors?: Array<{ code?: number; title?: string; message?: string; errorData?: { details?: string } }> }> : [];
  const error = statuses.filter(status => status.status === 'failed').at(-1)?.errors?.[0];
  return error ? { code: error.code, title: error.title, message: error.message, details: error.errorData?.details } : undefined;
}

export function transformMessage(msg: MetaMessage, conversationId: string, phoneNumberId: string): Message {
  const { image, video, audio, document, sticker, text, reaction, kapso } = msg;
  const kapsoExtensions = kapso as KapsoMessageExtensions | undefined;
  const messageTypeData = extractMessageTypeData(kapsoExtensions?.messageTypeData);
  const kapsoMediaData = extractMediaData(kapsoExtensions?.mediaData);
  const contextMessageId = extractContextMessageId(msg, kapsoExtensions, messageTypeData);

  const mediaId =
    image?.id ??
    video?.id ??
    audio?.id ??
    document?.id ??
    sticker?.id ??
    (typeof kapsoExtensions?.mediaData?.id === 'string' ? kapsoExtensions.mediaData.id : undefined);

  const mediaUrl =
    image?.link ??
    video?.link ??
    audio?.link ??
    document?.link ??
    sticker?.link ??
    (typeof kapsoExtensions?.mediaUrl === 'string' ? kapsoExtensions.mediaUrl : undefined) ??
    (typeof kapsoExtensions?.mediaData?.url === 'string' ? kapsoExtensions.mediaData.url : undefined);

  const hasMedia =
    Boolean(kapsoExtensions?.hasMedia) ||
    Boolean(mediaId) ||
    ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type);

  const resolvedMediaData = mediaUrl
    ? {
        url: mediaUrl,
        filename: document?.filename ?? messageTypeData?.filename ?? kapsoMediaData.filename,
        contentType: messageTypeData?.mimeType ?? kapsoMediaData.contentType,
        byteSize: kapsoMediaData.byteSize
      }
    : undefined;

  const kapsoContent = normaliseKapsoContent(kapsoExtensions?.content);
  const textBody = typeof text?.body === 'string' ? text.body : undefined;
  const reactionEmoji = typeof reaction?.emoji === 'string' ? reaction.emoji : undefined;
  const content = normalizeMessageContent({
    content: kapsoContent ?? textBody ?? reactionEmoji,
    messageType: msg.type,
    mediaUrl
  });

  const fallbackCaption =
    (typeof image?.caption === 'string' && image.caption) ||
    (typeof video?.caption === 'string' && video.caption) ||
    (typeof document?.caption === 'string' && document.caption) ||
    undefined;

  const lastMessageTimestamp = (kapsoExtensions as WithOptionalTimestamp | undefined)?.lastMessageTimestamp;

  return {
    id: msg.id,
    conversationId,
    businessScopedUserId: msg.fromUserId || msg.toUserId,
    parentBusinessScopedUserId: msg.fromParentUserId || msg.toParentUserId,
    username: typeof msg.username === 'string' ? msg.username : undefined,
    origin: typeof kapsoExtensions?.origin === 'string' ? kapsoExtensions.origin : undefined,
    passive: kapsoExtensions?.passive === true,
    deliveryError: extractDeliveryError(kapsoExtensions),
    messageTypeData: kapsoExtensions?.messageTypeData,
    flowResponse: kapsoExtensions?.flowResponse,
    flowToken: kapsoExtensions?.flowToken,
    flowName: kapsoExtensions?.flowName,
    location: msg.location,
    interactive: msg.interactive,
    template: msg.template,
    order: msg.order,
    orderText: kapsoExtensions?.orderText,
    contacts: msg.contacts,
    sticker: msg.sticker,
    context: msg.context,
    phoneNumberId,
    direction: kapsoExtensions?.direction === 'outbound' ? 'outbound' : 'inbound',
    content,
    createdAt: toIsoString(msg.timestamp, lastMessageTimestamp),
    status: typeof kapsoExtensions?.status === 'string' ? kapsoExtensions.status : undefined,
    phoneNumber: typeof kapsoExtensions?.phoneNumber === 'string' ? kapsoExtensions.phoneNumber : msg.from || msg.to,
    hasMedia,
    mediaData: resolvedMediaData,
    reactionEmoji,
    reactedToMessageId: typeof reaction?.messageId === 'string'
      ? reaction.messageId
      : messageTypeData?.messageId,
    contextMessageId,
    filename: document?.filename ?? messageTypeData?.filename ?? kapsoMediaData.filename,
    mimeType: messageTypeData?.mimeType ?? kapsoMediaData.contentType,
    messageType: msg.type,
    caption: fallbackCaption,
    metadata: {
      mediaId
    }
  };
}
