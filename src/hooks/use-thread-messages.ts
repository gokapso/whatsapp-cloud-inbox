'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { fetchConversationMessages, mergeMessagePages, type MessagePage } from '@/lib/inbox-data';
import { nextThreadPage, type MessagePageCursor } from '@/lib/inbox-pagination';

export function useThreadMessages(queryKey: readonly string[], conversationIds: string[], phoneNumberId?: string) {
  const firstConversationId = conversationIds[0];
  const history = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchConversationMessages(pageParam.conversationId, phoneNumberId, pageParam.after),
    initialPageParam: { conversationId: firstConversationId } as MessagePageCursor,
    getNextPageParam: (page: MessagePage, _pages, param) => nextThreadPage(conversationIds, param.conversationId, page.paging),
    enabled: !!firstConversationId,
    refetchInterval: query => (query.state.data?.pages.length ?? 0) <= 1 ? 5_000 : false,
  });
  const latest = useQuery({
    queryKey: [...queryKey, 'latest'],
    queryFn: () => fetchConversationMessages(firstConversationId, phoneNumberId),
    enabled: !!firstConversationId && (history.data?.pages.length ?? 0) > 1,
    refetchInterval: 5_000,
  });
  const messages = useMemo(() => {
    const pages = history.data?.pages ?? [];
    const mergedPages = pages.length > 1 && latest.data && latest.dataUpdatedAt > history.dataUpdatedAt ? [latest.data, ...pages] : pages;
    return mergeMessagePages(mergedPages);
  }, [history.data, history.dataUpdatedAt, latest.data, latest.dataUpdatedAt]);
  // Fill a short recent timeline across sessions without walking the entire contact history.
  // Older pages remain explicit, and polling still fetches only the newest page.
  const { data, hasNextPage, isFetching, error, fetchNextPage } = history;
  useEffect(() => {
    const pageCount = data?.pages.length ?? 0;
    if (pageCount > 0 && pageCount < 3 && messages.length < 50 && hasNextPage && !isFetching && !error) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [data, hasNextPage, isFetching, error, fetchNextPage, messages.length]);
  return {
    ...history,
    messages,
    error: history.error ?? latest.error,
  };
}
