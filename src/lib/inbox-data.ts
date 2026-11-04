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

export const MESSAGE_PAGE_LIMIT = 100;

export function conversationMessagesQueryKey(phoneNumberId: string | undefined, conversationId: string) {
  return ['conversation-messages', phoneNumberId ?? '', conversationId] as const;
}

export type MessagePaging = {
  cursors?: {
    before?: string | null;
    after?: string | null;
  } | null;
  next?: string | null;
  previous?: string | null;
};

export type ConversationMessagesPage = {
  messages: Message[];
  paging?: MessagePaging;
};

export type ConversationHistory = {
  messages: Message[];
  olderCursor: string | null;
  hasMoreOlder: boolean;
  hasLoadedOlder: boolean;
};

export type FetchConversationMessagesOptions = {
  phoneNumberId?: string;
  after?: string;
  before?: string;
  limit?: number;
};

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

export async function fetchConversationMessages(
  conversationId: string,
  options: FetchConversationMessagesOptions = {},
): Promise<ConversationMessagesPage> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? MESSAGE_PAGE_LIMIT),
  });
  if (options.phoneNumberId) {
    params.set('phoneNumberId', options.phoneNumberId);
  }
  if (options.after) {
    params.set('after', options.after);
  }
  if (options.before) {
    params.set('before', options.before);
  }

  const response = await fetch(`/api/messages/${conversationId}?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch messages');
  }

  const messages = (data.data || []).map((message: Omit<Message, 'conversationId'>) => ({
    ...message,
    phoneNumberId: message.phoneNumberId ?? options.phoneNumberId ?? '',
    conversationId,
  }));

  return {
    messages,
    paging: data.paging,
  };
}

export function olderCursorFromPaging(paging?: MessagePaging | null): string | null {
  if (!paging || typeof paging.next !== 'string' || !paging.next.trim()) return null;
  const after = paging.cursors?.after;
  if (typeof after !== 'string') return null;
  const cursor = after.trim();
  return cursor || null;
}

export function historyFromLatestPage(
  messages: Message[],
  paging?: MessagePaging | null,
): ConversationHistory {
  const olderCursor = olderCursorFromPaging(paging);
  return {
    messages,
    olderCursor,
    hasMoreOlder: olderCursor !== null,
    hasLoadedOlder: false,
  };
}

function compareMessages(a: Message, b: Message): number {
  const delta = parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt);
  if (delta !== 0) return delta;
  return a.id.localeCompare(b.id);
}

export function mergeMessages(
  existing: Message[],
  incoming: Message[],
  conflict: 'incoming-wins' | 'existing-wins' = 'incoming-wins',
): Message[] {
  const byId = new Map<string, Message>();

  if (conflict === 'existing-wins') {
    incoming.forEach((message) => byId.set(message.id, message));
    existing.forEach((message) => byId.set(message.id, message));
  } else {
    existing.forEach((message) => byId.set(message.id, message));
    incoming.forEach((message) => {
      const previous = byId.get(message.id);
      byId.set(message.id, previous ? { ...previous, ...message } : message);
    });
  }

  return Array.from(byId.values()).sort(compareMessages);
}

export function mergeLatestMessagePage(
  history: ConversationHistory | undefined,
  page: ConversationMessagesPage,
): ConversationHistory {
  const latest = historyFromLatestPage(page.messages, page.paging);
  if (!history) return latest;
  if (page.messages.length === 0) return history;

  const mergedMessages = mergeMessages(history.messages, page.messages);
  const historyIds = new Set(history.messages.map((message) => message.id));
  const overlaps = page.messages.some((message) => historyIds.has(message.id));

  if (!history.hasLoadedOlder || overlaps) {
    if (!history.hasLoadedOlder) {
      return {
        messages: mergedMessages,
        olderCursor: latest.olderCursor,
        hasMoreOlder: latest.hasMoreOlder,
        hasLoadedOlder: false,
      };
    }

    return {
      messages: mergedMessages,
      olderCursor: history.olderCursor,
      hasMoreOlder: history.hasMoreOlder,
      hasLoadedOlder: true,
    };
  }

  // The latest page no longer overlaps loaded history, so walk back from the new edge.
  return {
    messages: mergedMessages,
    olderCursor: latest.olderCursor,
    hasMoreOlder: latest.hasMoreOlder,
    hasLoadedOlder: false,
  };
}

export function mergeOlderMessagePage(
  history: ConversationHistory,
  page: ConversationMessagesPage,
): ConversationHistory {
  const knownIds = new Set(history.messages.map((message) => message.id));
  const addedCount = page.messages.filter((message) => !knownIds.has(message.id)).length;
  const overlapsKnown = page.messages.some((message) => knownIds.has(message.id));
  const olderCursor = olderCursorFromPaging(page.paging);
  const cursorAdvanced = olderCursor !== null && olderCursor !== history.olderCursor;
  // A page of already-loaded messages can still sit in front of older ones after the latest edge moves.
  const hasMoreOlder = cursorAdvanced && (addedCount > 0 || overlapsKnown);

  return {
    messages: mergeMessages(history.messages, page.messages, 'existing-wins'),
    olderCursor: hasMoreOlder ? olderCursor : null,
    hasMoreOlder,
    hasLoadedOlder: true,
  };
}

function oldestMessageTimestamp(messages: Message[]): number {
  const contentMessages = messages.filter((message) => message.messageType !== 'reaction');
  const source = contentMessages.length > 0 ? contentMessages : messages;
  return source.reduce((oldest, message) => {
    const time = parseTimestamp(message.createdAt);
    return time < oldest ? time : oldest;
  }, Number.POSITIVE_INFINITY);
}

function incompleteHistoryEdge(history: ConversationHistory): number | null {
  if (!history.hasMoreOlder || !history.olderCursor || history.messages.length === 0) return null;
  return oldestMessageTimestamp(history.messages);
}

export function selectConversationForOlderPage(
  histories: Array<{ conversationId: string; history: ConversationHistory }>,
): string | null {
  let selected: { conversationId: string; oldest: number } | null = null;

  for (const item of histories) {
    const oldest = incompleteHistoryEdge(item.history);
    if (oldest === null) continue;
    // Page the newest incomplete conversation so the timeline stays a contiguous suffix.
    if (
      !selected ||
      oldest > selected.oldest ||
      (oldest === selected.oldest && item.conversationId.localeCompare(selected.conversationId) < 0)
    ) {
      selected = { conversationId: item.conversationId, oldest };
    }
  }

  return selected?.conversationId ?? null;
}

function historyFrontierTimestamp(histories: ConversationHistory[]): number | null {
  let frontier: number | null = null;

  for (const history of histories) {
    const oldest = incompleteHistoryEdge(history);
    if (oldest === null) continue;
    if (frontier === null || oldest > frontier) frontier = oldest;
  }

  return frontier;
}

export function filterMessagesToHistoryFrontier(
  messages: Message[],
  histories: ConversationHistory[],
): Message[] {
  const frontier = historyFrontierTimestamp(histories);
  if (frontier === null) return messages;
  return messages.filter((message) => parseTimestamp(message.createdAt) >= frontier);
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
