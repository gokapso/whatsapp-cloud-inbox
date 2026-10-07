import type { GraphPaging, MediaData, MetaMessage } from '@kapso/whatsapp-cloud-api';

import { buildIdentityKeys, type WhatsappIdentity } from './whatsapp-identity';
import { readInboxResponse } from './inbox-errors';

export type ConversationStatusFilter = 'all' | 'active' | 'ended';

export type Conversation = WhatsappIdentity & {
  id: string;
  phoneNumber?: string;
  status: string;
  lastActiveAt?: string;
  lastInboundAt?: string;
  phoneNumberId: string;
  inboxPhoneNumber?: string;
  inboxDisplayName?: string;
  businessAccountId?: string;
  metadata?: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  lastMessage?: {
    content: string;
    direction: string;
    type?: string;
  };
};

export type DeliveryError = { code?: number; title?: string; message?: string; details?: string };

export type Message = WhatsappIdentity & {
  id: string;
  conversationId: string;
  phoneNumberId: string;
  origin?: string;
  passive?: boolean;
  deliveryError?: DeliveryError;
  messageTypeData?: Record<string, unknown>;
  flowResponse?: Record<string, unknown>;
  flowToken?: string;
  flowName?: string;
  location?: MetaMessage['location'];
  interactive?: MetaMessage['interactive'];
  template?: MetaMessage['template'];
  order?: MetaMessage['order'];
  orderText?: string;
  contacts?: MetaMessage['contacts'];
  sticker?: MetaMessage['sticker'];
  context?: MetaMessage['context'];
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber?: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
  } | (MediaData & { url: string });
  reactionEmoji?: string | null;
  reactedToMessageId?: string | null;
  contextMessageId?: string | null;
  repliedTo?: {
    id: string;
    conversationId: string;
    content: string;
    direction: 'inbound' | 'outbound';
    messageType?: string;
    senderName?: string;
  } | null;
  filename?: string | null;
  mimeType?: string | null;
  messageType?: string;
  caption?: string | null;
  metadata?: {
    mediaId?: string;
    caption?: string;
  };
};

export type ConversationThread = WhatsappIdentity & {
  key: string;
  phoneNumber?: string;
  phoneNumberId: string;
  inboxPhoneNumber?: string;
  inboxDisplayName?: string;
  businessAccountId?: string;
  contactName?: string;
  conversations: Conversation[];
  latestConversation: Conversation;
  conversationCount: number;
  previousConversationIds: string[];
  status: string;
  lastActiveAt?: string;
  lastInboundAt?: string;
  lastMessage?: Conversation['lastMessage'];
};

export const CONVERSATIONS_QUERY_KEY = ['conversations'] as const;

export function conversationMessagesQueryKey(phoneNumberId: string | undefined, conversationId: string) {
  return ['conversation-messages', phoneNumberId ?? '', conversationId] as const;
}

export function phoneThreadMessagesQueryKey(
  phoneNumberId: string | undefined,
  phoneNumber: string | undefined,
  conversationIds: string[]
) {
  return ['phone-thread-messages', phoneNumberId ?? '', phoneNumber ?? '', conversationIds.join(':')] as const;
}

export function parseTimestamp(timestamp?: string): number {
  if (!timestamp) return 0;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? time : 0;
}

function byMostRecentConversation(a: Conversation, b: Conversation): number {
  const delta = parseTimestamp(b.lastActiveAt) - parseTimestamp(a.lastActiveAt);
  if (delta !== 0) return delta;
  return b.id.localeCompare(a.id);
}

export type ConversationPage = {
  data: Conversation[];
  nextCursor?: string;
  partialErrors: Array<{ phoneNumberId: string; error: string }>;
};

export type MessagePage = { data: Message[]; paging?: GraphPaging };

export async function fetchConversations(cursor?: string): Promise<ConversationPage> {
  const params = new URLSearchParams({ limit: '100' });
  if (cursor) params.set('cursor', cursor);
  return readInboxResponse<ConversationPage>(await fetch(`/api/conversations?${params}`));
}

export async function fetchConversationMessages(conversationId: string, phoneNumberId?: string, after?: string): Promise<MessagePage> {
  const params = new URLSearchParams({ limit: '100' });
  if (phoneNumberId) params.set('phoneNumberId', phoneNumberId);
  if (after) params.set('after', after);
  return readInboxResponse<MessagePage>(await fetch(`/api/messages/${encodeURIComponent(conversationId)}?${params}`));
}

export function mergeConversations(pages: ConversationPage[]): Conversation[] {
  // Fresh head data wins over overlapping historical pages.
  const records = new Map<string, Conversation>();
  for (const page of [...pages].reverse()) {
    for (const conversation of page.data) records.set(conversation.id, conversation);
  }
  return [...records.values()];
}

export function mergeMessagePages(pages: MessagePage[]): Message[] {
  const records = new Map<string, Message>();
  for (const page of [...pages].reverse()) {
    for (const message of page.data) records.set(message.id, message);
  }
  return normalizeMessages([...records.values()]);
}

export function groupConversationsByPhoneNumber(conversations: Conversation[]): ConversationThread[] {
  const groupedConversations = new Map<string, Conversation[]>();
  const identityKeys = buildIdentityKeys(conversations);

  conversations.forEach((conversation) => {
    const key = identityKeys.get(conversation.id)!;
    const existing = groupedConversations.get(key) || [];
    existing.push(conversation);
    groupedConversations.set(key, existing);
  });

  return Array.from(groupedConversations.entries())
    .map(([key, threadConversations]) => {
      const sortedConversations = [...threadConversations].sort(byMostRecentConversation);
      const latestConversation = sortedConversations[0];

      return {
        key,
        phoneNumber: latestConversation.phoneNumber || sortedConversations.find(conversation => conversation.phoneNumber)?.phoneNumber,
        businessScopedUserId: latestConversation.businessScopedUserId || sortedConversations.find(conversation => conversation.businessScopedUserId)?.businessScopedUserId,
        parentBusinessScopedUserId: latestConversation.parentBusinessScopedUserId || sortedConversations.find(conversation => conversation.parentBusinessScopedUserId)?.parentBusinessScopedUserId,
        username: latestConversation.username || sortedConversations.find(conversation => conversation.username)?.username,
        phoneNumberId: latestConversation.phoneNumberId,
        inboxPhoneNumber: latestConversation.inboxPhoneNumber,
        inboxDisplayName: latestConversation.inboxDisplayName,
        businessAccountId: latestConversation.businessAccountId,
        contactName: latestConversation.contactName || sortedConversations.find(conversation => conversation.contactName)?.contactName,
        conversations: sortedConversations,
        latestConversation,
        conversationCount: sortedConversations.length,
        previousConversationIds: sortedConversations.slice(1).map(conversation => conversation.id),
        status: latestConversation.status,
        lastActiveAt: latestConversation.lastActiveAt,
        lastInboundAt: sortedConversations.map(conversation => conversation.lastInboundAt).filter((date): date is string => Boolean(date)).sort((a, b) => parseTimestamp(b) - parseTimestamp(a))[0],
        lastMessage: latestConversation.lastMessage,
      };
    })
    .sort((a, b) => byMostRecentConversation(a.latestConversation, b.latestConversation));
}

export function filterConversationThreads(
  threads: ConversationThread[],
  statusFilter: ConversationStatusFilter,
  searchQuery: string,
): ConversationThread[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const phoneQuery = /^[+\d\s().-]+$/.test(normalizedQuery) ? normalizedQuery.replace(/\D/g, '') : '';

  return threads.filter((thread) => {
    if (statusFilter !== 'all' && thread.latestConversation.status !== statusFilter) {
      return false;
    }

    if (!normalizedQuery) return true;

    return (
      thread.phoneNumber?.toLowerCase().includes(normalizedQuery) ||
      thread.inboxPhoneNumber?.toLowerCase().includes(normalizedQuery) ||
      (phoneQuery && (
        thread.phoneNumber?.replace(/\D/g, '').includes(phoneQuery) ||
        thread.inboxPhoneNumber?.replace(/\D/g, '').includes(phoneQuery)
      )) ||
      thread.inboxDisplayName?.toLowerCase().includes(normalizedQuery) ||
      thread.contactName?.toLowerCase().includes(normalizedQuery) ||
      thread.username?.toLowerCase().includes(normalizedQuery.replace(/^@/, '')) ||
      thread.businessScopedUserId?.toLowerCase().includes(normalizedQuery) ||
      thread.parentBusinessScopedUserId?.toLowerCase().includes(normalizedQuery) ||
      thread.conversations.some(conversation => conversation.id.toLowerCase().includes(normalizedQuery))
    );
  });
}

export function countThreadsByStatus(threads: ConversationThread[]) {
  return threads.reduce(
    (counts, thread) => {
      counts.all += 1;
      if (thread.latestConversation.status === 'active') counts.active += 1;
      if (thread.latestConversation.status === 'ended') counts.ended += 1;
      return counts;
    },
    { all: 0, active: 0, ended: 0 },
  );
}

export function shortConversationId(conversationId?: string): string {
  if (!conversationId) return '';
  return conversationId.replace(/-/g, '').slice(0, 8);
}

export function getReplyPreviewContent(
  message: Message,
  maxLength = 140,
  contentOverride?: string | null,
): string {
  const content = contentOverride || message.caption || message.content || message.filename || '';
  const trimmedContent = content.trim();

  if (trimmedContent) {
    return trimmedContent.length > maxLength ? `${trimmedContent.slice(0, maxLength - 3)}...` : trimmedContent;
  }

  if (message.hasMedia && message.messageType) {
    return `${message.messageType.charAt(0).toUpperCase()}${message.messageType.slice(1)} message`;
  }

  return 'Message';
}

export function normalizeMessages(messages: Message[]): Message[] {
  const reactions = messages.filter(message => message.messageType === 'reaction').sort((a, b) => parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt) || a.id.localeCompare(b.id));
  const regularMessages = messages.filter(message => message.messageType !== 'reaction');
  const reactionMap = new Map<string, string>();
  const messageMap = new Map(regularMessages.map(message => [message.id, message]));

  reactions.forEach((reaction) => {
    if (reaction.reactedToMessageId && typeof reaction.reactionEmoji === 'string') {
      reactionMap.set(reaction.reactedToMessageId, reaction.reactionEmoji);
    }
  });

  return regularMessages
    .map((message) => {
      const reaction = reactionMap.get(message.id);
      const contextMessageId = message.contextMessageId?.trim();
      const repliedMessage = contextMessageId ? messageMap.get(contextMessageId) : undefined;
      const repliedTo = message.repliedTo ?? (
        repliedMessage
          ? {
              id: repliedMessage.id,
              conversationId: repliedMessage.conversationId,
              content: getReplyPreviewContent(repliedMessage, 120),
              direction: repliedMessage.direction,
              messageType: repliedMessage.messageType,
              senderName: repliedMessage.direction === 'outbound' ? 'You' : 'Contact',
            }
          : contextMessageId
            ? {
                id: contextMessageId,
                conversationId: message.conversationId,
                content: 'Original message',
                direction: 'inbound' as const,
                senderName: 'Contact',
              }
            : undefined
      );

      return {
        ...message,
        ...(reaction !== undefined ? { reactionEmoji: reaction || null } : {}),
        ...(repliedTo ? { repliedTo } : {}),
      };
    })
    .sort((a, b) => parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt));
}
