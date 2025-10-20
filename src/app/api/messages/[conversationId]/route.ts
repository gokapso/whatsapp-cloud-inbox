import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type KapsoMessageExtensions,
  type MediaData,
  type MetaMessage
} from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

    const response = await whatsappClient.messages.listByConversation({
      phoneNumberId: PHONE_NUMBER_ID,
      conversationId,
      limit,
      fields: buildKapsoFields([
        'direction',
        'status',
        'processing_status',
        'phone_number',
        'has_media',
        'media_data',
        'media_url',
        'whatsapp_conversation_id',
        'contact_name',
        'message_type_data',
        'content',
        'flow_response',
        'flow_token',
        'flow_name',
        'order_text'
      ])
    });

    // Transform messages to match frontend expectations
    const transformedData = response.data.map((msg: MetaMessage) => {
      const { image, video, audio, document, sticker, text, reaction, kapso } = msg;
      const kapsoExtensions = kapso as KapsoMessageExtensions | undefined;
      const messageTypeData = extractMessageTypeData(kapsoExtensions?.messageTypeData);
      const kapsoMediaData = extractMediaData(kapsoExtensions?.mediaData);

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

      const fallbackCaption =
        (typeof image?.caption === 'string' && image.caption) ||
        (typeof video?.caption === 'string' && video.caption) ||
        (typeof document?.caption === 'string' && document.caption) ||
        undefined;

      const lastMessageTimestamp = (kapsoExtensions as WithOptionalTimestamp | undefined)?.lastMessageTimestamp;

      return {
        id: msg.id,
        direction: typeof kapsoExtensions?.direction === 'string' ? kapsoExtensions.direction : 'inbound',
        content: kapsoContent ?? textBody ?? reactionEmoji ?? fallbackCaption ?? '',
        createdAt: toIsoString(msg.timestamp, lastMessageTimestamp),
        status: typeof kapsoExtensions?.status === 'string' ? kapsoExtensions.status : undefined,
        phoneNumber: typeof kapsoExtensions?.phoneNumber === 'string' ? kapsoExtensions.phoneNumber : msg.from,
        hasMedia,
        mediaData: resolvedMediaData,
        reactionEmoji,
        reactedToMessageId: typeof reaction?.messageId === 'string'
          ? reaction.messageId
          : messageTypeData?.messageId,
        filename: document?.filename ?? messageTypeData?.filename ?? kapsoMediaData.filename,
        mimeType: messageTypeData?.mimeType ?? kapsoMediaData.contentType,
        messageType: msg.type,
        caption: fallbackCaption,
        metadata: {
          mediaId
        }
      };
    });

    return NextResponse.json({
      data: transformedData,
      paging: response.paging
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages', conversationId },
      { status: 500 }
    );
  }
}
