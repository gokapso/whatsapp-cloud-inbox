'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CONVERSATIONS_QUERY_KEY, fetchConversations, mergeConversations } from '@/lib/inbox-data';

export function useConversations() {
  const history = useInfiniteQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchConversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
    refetchInterval: query => (query.state.data?.pages.length ?? 0) <= 1 ? 10_000 : false,
  });
  const latest = useQuery({
    queryKey: [...CONVERSATIONS_QUERY_KEY, 'latest'],
    queryFn: () => fetchConversations(),
    enabled: (history.data?.pages.length ?? 0) > 1,
    refetchInterval: 10_000,
  });
  const mergedPages = useMemo(() => {
    const pages = history.data?.pages ?? [];
    return pages.length > 1 && latest.data && latest.dataUpdatedAt > history.dataUpdatedAt ? [latest.data, ...pages] : pages;
  }, [history.data, history.dataUpdatedAt, latest.data, latest.dataUpdatedAt]);
  const conversations = useMemo(() => mergeConversations(mergedPages), [mergedPages]);
  const headConversationIds = useMemo(() => new Set(mergedPages[0]?.data.map(conversation => conversation.id)), [mergedPages]);
  return {
    ...history,
    conversations,
    headConversationIds,
    partialErrors: (latest.data && mergedPages[0] === latest.data ? latest.data : history.data?.pages.at(-1))?.partialErrors ?? [],
    error: history.error ?? latest.error,
  };
}
