import type { MediaData } from '@kapso/whatsapp-cloud-api';

export type ConversationStatusFilter = 'all' | 'active' | 'ended';

export type Conversation = {
  id: string;
  phoneNumber: string;
  status: string;
  lastActiveAt?: string;
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

export type Message = {
  id: string;
  conversationId: string;
  phoneNumberId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
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

export type ConversationThread = {
  key: string;
  phoneNumber: string;
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

function parseTimestamp(timestamp?: string): number {
  if (!timestamp) return 0;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) ? time : 0;
}

function conversationGroupKey(conversation: Conversation): string {
  const phoneNumber = conversation.phoneNumber.trim();
  const comparablePhoneNumber = phoneNumber.replace(/\D/g, '');
  const contactKey = comparablePhoneNumber || phoneNumber || `conversation:${conversation.id}`;
  return `${conversation.phoneNumberId}:${contactKey}`;
}

function byMostRecentConversation(a: Conversation, b: Conversation): number {
  const delta = parseTimestamp(b.lastActiveAt) - parseTimestamp(a.lastActiveAt);
  if (delta !== 0) return delta;
  return b.id.localeCompare(a.id);
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch('/api/conversations?limit=100');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch conversations');
  }

  return data.data || [];
}

export async function fetchConversationMessages(conversationId: string, phoneNumberId?: string): Promise<Message[]> {
  const params = new URLSearchParams({ limit: '100' });
  if (phoneNumberId) {
    params.set('phoneNumberId', phoneNumberId);
  }

  const response = await fetch(`/api/messages/${conversationId}?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch messages');
  }

  const messages = (data.data || []).map((message: Omit<Message, 'conversationId'>) => ({
    ...message,
    phoneNumberId: message.phoneNumberId ?? phoneNumberId ?? '',
    conversationId,
  }));

  return normalizeMessages(messages);
}

export function groupConversationsByPhoneNumber(conversations: Conversation[]): ConversationThread[] {
  const groupedConversations = new Map<string, Conversation[]>();

  conversations.forEach((conversation) => {
    const key = conversationGroupKey(conversation);
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
        phoneNumber: latestConversation.phoneNumber,
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

  return threads.filter((thread) => {
    if (statusFilter !== 'all' && thread.latestConversation.status !== statusFilter) {
      return false;
    }

    if (!normalizedQuery) return true;

    return (
      thread.phoneNumber.toLowerCase().includes(normalizedQuery) ||
      thread.inboxPhoneNumber?.toLowerCase().includes(normalizedQuery) ||
      thread.inboxDisplayName?.toLowerCase().includes(normalizedQuery) ||
      thread.contactName?.toLowerCase().includes(normalizedQuery) ||
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

function getReplyPreviewContent(message: Message): string {
  const content = message.caption || message.content || message.filename || '';
  const trimmedContent = content.trim();

  if (trimmedContent) {
    return trimmedContent.length > 120 ? `${trimmedContent.slice(0, 117)}...` : trimmedContent;
  }

  if (message.hasMedia && message.messageType) {
    return `${message.messageType.charAt(0).toUpperCase()}${message.messageType.slice(1)} message`;
  }

  return 'Message';
}

export function normalizeMessages(messages: Message[]): Message[] {
  const reactions = messages.filter(message => message.messageType === 'reaction');
  const regularMessages = messages.filter(message => message.messageType !== 'reaction');
  const reactionMap = new Map<string, string>();
  const messageMap = new Map(regularMessages.map(message => [message.id, message]));

  reactions.forEach((reaction) => {
    if (reaction.reactedToMessageId && reaction.reactionEmoji) {
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
              content: getReplyPreviewContent(repliedMessage),
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
        ...(reaction ? { reactionEmoji: reaction } : {}),
        ...(repliedTo ? { repliedTo } : {}),
      };
    })
    .sort((a, b) => parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt));
}
