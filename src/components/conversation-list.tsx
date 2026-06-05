'use client';

import { useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import { RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAutoPolling } from '@/hooks/use-auto-polling';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';

type Conversation = {
  id: string;
  phoneNumber: string;
  status: string;
  lastActiveAt: string;
  phoneNumberId: string;
  metadata?: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  lastMessage?: {
    content: string;
    direction: string;
    type?: string;
  };
};

function formatConversationDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '';

    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  } catch {
    return '';
  }
}

function getAvatarInitials(contactName?: string, phoneNumber?: string): string {
  if (contactName) {
    const words = contactName.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return contactName.slice(0, 2).toUpperCase();
  }

  if (phoneNumber) {
    const digits = phoneNumber.replace(/\D/g, '');
    return digits.slice(-2);
  }

  return '??';
}

type Props = {
  onSelectConversation: (conversation: Conversation) => void;
  selectedConversationId?: string;
  isHidden?: boolean;
};

export type ConversationListRef = {
  refresh: () => Promise<Conversation[]>;
  selectByPhoneNumber: (phoneNumber: string) => void;
};

export const ConversationList = forwardRef<ConversationListRef, Props>(
  ({ onSelectConversation, selectedConversationId, isHidden = false }, ref) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      setConversations(data.data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  // Auto-polling for conversations (every 10 seconds)
  const { isPolling } = useAutoPolling({
    interval: 10000,
    enabled: true,
    onPoll: fetchConversations
  });

  const selectByPhoneNumber = (phoneNumber: string) => {
    const conversation = conversations.find(conv => conv.phoneNumber === phoneNumber);
    if (conversation) {
      onSelectConversation(conversation);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      setRefreshing(true);
      const response = await fetch('/api/conversations');
      const data = await response.json();
      const newConversations = data.data || [];
      setConversations(newConversations);
      setRefreshing(false);
      return newConversations;
    },
    selectByPhoneNumber
  }));

  const filteredConversations = conversations.filter((conv) => {
    const query = searchQuery.toLowerCase();
    return (
      conv.phoneNumber.toLowerCase().includes(query) ||
      conv.contactName?.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className={cn(
        "flex min-h-0 w-full min-w-0 flex-col border-[var(--chat-border-strong)] bg-[var(--chat-surface)] md:w-[22rem] md:flex-none md:border-r lg:w-[24rem] xl:w-[26rem]",
        isHidden && "hidden md:flex"
      )}>
        <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] p-3 safe-area-top sm:p-4">
          <div className="mb-3 flex items-center justify-between pt-1">
            <Skeleton className="h-7 w-20" />
            <div className="flex items-center gap-2">
              <ThemeToggle className="size-11 md:size-10" />
              <Skeleton className="size-10" />
            </div>
          </div>
          <Skeleton className="h-11 w-full rounded-lg md:h-10" />
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex gap-3 p-3">
              <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex min-h-0 w-full min-w-0 flex-col border-[var(--chat-border-strong)] bg-[var(--chat-surface)] md:w-[22rem] md:flex-none md:border-r lg:w-[24rem] xl:w-[26rem]",
      isHidden && "hidden md:flex"
    )}>
      <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] p-3 safe-area-top sm:p-4">
        <div className="mb-3 flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground sm:text-xl">Chats</h1>
            {isPolling && (
              <div
                className="h-2 w-2 rounded-full bg-[var(--chat-presence)] animate-pulse"
                title="Auto-updating"
                role="status"
                aria-label="Auto-updating conversations"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="size-11 md:size-10" />
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:bg-[var(--chat-icon-hover)] md:size-10"
              aria-label="Refresh conversations"
              title="Refresh conversations"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or start new chat"
            aria-label="Search conversations"
            className="h-11 rounded-lg border-[var(--chat-border-strong)] bg-[var(--chat-input)] pl-9 text-base focus-visible:ring-primary md:h-10 md:text-sm"
          />
        </div>
      </div>

      <ScrollArea className="h-0 flex-1 overflow-hidden overscroll-contain">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No conversations found' : 'No conversations yet'}
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            {filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={cn(
                  'relative min-h-[72px] w-full touch-manipulation overflow-hidden border-b border-[var(--chat-border)] p-3 text-left transition-[background-color,transform] hover:bg-[var(--chat-hover)] active:scale-[0.995] sm:pr-4',
                  selectedConversationId === conversation.id && 'bg-[var(--chat-hover)]'
                )}
              >
                <div className="flex gap-3 items-start overflow-hidden">
                  <Avatar className="h-11 w-11 flex-shrink-0 sm:h-12 sm:w-12">
                    <AvatarFallback className="bg-[var(--chat-avatar)] text-foreground text-sm font-medium">
                      {getAvatarInitials(conversation.contactName, conversation.phoneNumber)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 flex justify-between items-start gap-2 overflow-hidden sm:gap-4">
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="font-medium text-foreground truncate">
                        {conversation.contactName || conversation.phoneNumber}
                      </p>
                      {conversation.lastMessage && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {conversation.lastMessage.direction === 'outbound' && (
                            <span className="text-[var(--chat-check)]">✓ </span>
                          )}
                          {conversation.lastMessage.content}
                        </p>
                      )}
                    </div>
                    <span className="ml-2 mt-0.5 flex-shrink-0 text-xs tabular-nums text-muted-foreground sm:ml-4">
                      {formatConversationDate(conversation.lastActiveAt)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

ConversationList.displayName = 'ConversationList';
