'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, differenceInHours, differenceInMinutes, format, isValid, isYesterday } from 'date-fns';
import { BellOff, Check, ChevronDown, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CONVERSATIONS_QUERY_KEY,
  type ConversationThread,
  type ConversationStatusFilter,
  countThreadsByStatus,
  fetchConversations,
  filterConversationThreads,
  groupConversationsByPhoneNumber,
  shortConversationId,
} from '@/lib/inbox-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';

function formatConversationDate(timestamp?: string): string {
  if (!timestamp) return '';

  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return '';

    const now = new Date();
    const minutes = differenceInMinutes(now, date);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;

    const hours = differenceInHours(now, date);
    if (hours < 24) return `${hours}h`;

    if (isYesterday(date)) return 'Yesterday';
    const days = differenceInDays(now, date);
    if (days < 7) return `${days}d`;

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

const STATUS_FILTERS: Array<{ value: ConversationStatusFilter; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];

const FILTER_MENU_ITEMS = [
  { label: 'Assignee', disabled: true },
  { label: 'Phone number', action: 'phone-number' },
  { label: 'Unread', disabled: true },
  { label: 'Handoff', disabled: true },
] as const;

type Props = {
  onSelectThread: (thread: ConversationThread) => void;
  selectedThreadKey?: string;
  isHidden?: boolean;
};

export function ConversationList({ onSelectThread, selectedThreadKey, isHidden = false }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatusFilter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: conversations = [],
    error,
    isPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
    refetchInterval: 10_000,
  });

  const threads = useMemo(
    () => groupConversationsByPhoneNumber(conversations),
    [conversations],
  );

  const threadCounts = useMemo(
    () => countThreadsByStatus(threads),
    [threads],
  );

  const filteredThreads = useMemo(
    () => filterConversationThreads(threads, statusFilter, searchQuery),
    [threads, statusFilter, searchQuery],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isStatusMenuOpen && !isFilterMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
        setIsFilterMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStatusMenuOpen(false);
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterMenuOpen, isStatusMenuOpen]);

  const selectedStatusLabel = STATUS_FILTERS.find(filter => filter.value === statusFilter)?.label || 'Active';

  if (isPending) {
    return (
      <div className={cn(
        "flex min-h-0 w-full min-w-0 flex-col border-[var(--chat-border-strong)] bg-[var(--chat-surface)] md:w-[22rem] md:flex-none md:border-r lg:w-[24rem] xl:w-[26rem]",
        isHidden && "hidden md:flex"
      )}>
        <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] px-3 py-3 safe-area-top">
          <div className="mb-3 flex items-center justify-between pt-1">
            <Skeleton className="h-6 w-20" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="mt-2 flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-hidden p-3">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex gap-3 py-2">
              <Skeleton className="size-9 flex-shrink-0 rounded-full" />
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
      <div ref={controlsRef} className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] px-3 py-3 safe-area-top">
        <div className="mb-3 flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground">Inbox</h1>
            {isFetching && (
              <div
                className="h-2 w-2 rounded-full bg-[var(--chat-presence)] animate-pulse"
                title="Auto-updating"
                role="status"
                aria-label="Auto-updating conversations"
              />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              size="icon"
              className="size-8 rounded-md text-muted-foreground hover:bg-[var(--chat-icon-hover)] hover:text-foreground"
              aria-label="Refresh conversations"
              title="Refresh conversations"
            >
              {refreshing ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <BellOff className="size-4" />
              )}
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-8 rounded-md text-muted-foreground hover:bg-[var(--chat-icon-hover)] hover:text-foreground"
              aria-label="Inbox settings"
              title="Inbox settings"
            >
              <Link href="/settings">
                <Settings className="size-4" />
              </Link>
            </Button>
            <ThemeToggle className="size-8 rounded-md text-muted-foreground md:size-8" />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search phone numbers..."
            aria-label="Search phone numbers"
            className="h-9 rounded-md border-[var(--chat-border-strong)] bg-[var(--chat-input)] pl-9 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsStatusMenuOpen(open => !open);
                setIsFilterMenuOpen(false);
              }}
              className="h-8 gap-1 rounded-md bg-[var(--chat-hover)] px-2.5 text-xs font-medium text-foreground hover:bg-[var(--chat-icon-hover)]"
              aria-haspopup="menu"
              aria-expanded={isStatusMenuOpen}
            >
              {selectedStatusLabel}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>

            {isStatusMenuOpen && (
              <div
                role="menu"
                aria-label="Conversation status"
                className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-40 rounded-md border border-[var(--chat-border-strong)] bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              >
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={statusFilter === filter.value}
                    onClick={() => {
                      setStatusFilter(filter.value);
                      setIsStatusMenuOpen(false);
                    }}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs font-medium text-foreground hover:bg-[var(--chat-hover)]"
                  >
                    <span className="flex-1">{filter.label}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{threadCounts[filter.value]}</span>
                    {statusFilter === filter.value && <Check className="size-3.5 text-[var(--chat-presence)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsFilterMenuOpen(open => !open);
                setIsStatusMenuOpen(false);
              }}
              className="h-8 gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-[var(--chat-hover)] hover:text-foreground"
              aria-haspopup="menu"
              aria-expanded={isFilterMenuOpen}
            >
              <Plus className="size-3.5" />
              Filter
            </Button>

            {isFilterMenuOpen && (
              <div
                role="menu"
                aria-label="Additional filters"
                className="absolute left-0 top-[calc(100%+0.25rem)] z-50 w-44 rounded-md border border-[var(--chat-border-strong)] bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              >
                {FILTER_MENU_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={'disabled' in item && item.disabled}
                    onClick={() => {
                      if ('action' in item && item.action === 'phone-number') {
                        searchInputRef.current?.focus();
                      }
                      setIsFilterMenuOpen(false);
                    }}
                    className={cn(
                      'flex h-8 w-full items-center rounded px-2 text-left text-xs font-medium text-foreground hover:bg-[var(--chat-hover)]',
                      'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="h-0 flex-1 overflow-hidden overscroll-contain">
        {error ? (
          <div className="p-4 text-center text-sm text-destructive">
            Failed to load conversations
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? 'No phone numbers found' : 'No conversations found'}
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            {filteredThreads.map((thread) => (
              <button
                key={thread.key}
                onClick={() => onSelectThread(thread)}
                className={cn(
                  'relative min-h-[68px] w-full touch-manipulation overflow-hidden border-b border-[var(--chat-border)] px-3 py-2 text-left transition-colors hover:bg-[var(--chat-hover)]',
                  selectedThreadKey === thread.key && 'bg-[var(--chat-hover)]'
                )}
              >
                <div className="flex items-start gap-3 overflow-hidden">
                  <Avatar className="mt-0.5 size-9 flex-shrink-0">
                    <AvatarFallback className="bg-cyan-100 text-xs font-semibold text-cyan-950">
                      {getAvatarInitials(thread.contactName, thread.phoneNumber)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2 overflow-hidden">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="truncate text-sm font-semibold leading-5 text-foreground">
                        {thread.contactName || thread.phoneNumber || 'Unknown phone number'}
                      </p>
                      {thread.lastMessage && (
                        <p className="truncate text-xs leading-4 text-muted-foreground">
                          {thread.lastMessage.direction === 'outbound' && (
                            <span className="text-[var(--chat-check)]">✓ </span>
                          )}
                          {thread.lastMessage.content}
                        </p>
                      )}
                      <p className="truncate text-[11px] leading-4 text-muted-foreground/80">
                        {thread.phoneNumber}
                        {(thread.inboxDisplayName || thread.inboxPhoneNumber) &&
                          ` · via ${thread.inboxDisplayName || thread.inboxPhoneNumber}`}
                        {thread.conversationCount > 1 && ` · ${thread.conversationCount} conversations`}
                      </p>
                    </div>
                    <div className="ml-2 flex flex-shrink-0 flex-col items-end gap-2 pt-1">
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        {formatConversationDate(thread.lastActiveAt)}
                      </span>
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          thread.status === 'active' ? 'bg-[var(--chat-presence)]' : 'bg-muted-foreground/45'
                        )}
                        title={`Latest conversation is ${thread.status}. Conversation ${shortConversationId(thread.latestConversation.id)}`}
                      />
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
