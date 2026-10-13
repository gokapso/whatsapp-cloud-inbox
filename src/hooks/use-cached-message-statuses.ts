'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useQueryClient, type InfiniteData, type Query } from '@tanstack/react-query';
import type { MessagePage } from '@/lib/inbox-data';
import { collectCachedMessageStatuses } from '@/lib/cached-message-status';

function isMessageQuery(query: Query): boolean {
  return query.queryKey[0] === 'phone-thread-messages' || query.queryKey[0] === 'conversation-messages';
}

function serverSnapshot(): string {
  return '';
}

export function useCachedMessageStatuses() {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(event => {
    if (isMessageQuery(event.query)) notify();
  }), [cache]);
  const getSnapshot = useCallback(() => cache.findAll({ predicate: isMessageQuery })
    .map(query => `${query.queryHash}:${query.state.dataUpdatedAt}:${query.state.dataUpdateCount}`)
    .join('\n'), [cache]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  return useMemo(() => {
    if (!snapshot) return new Map<string, string>();
    return collectCachedMessageStatuses(cache.findAll({ predicate: isMessageQuery })
      .flatMap(query => {
        const data = query.state.data as InfiniteData<MessagePage> | MessagePage | undefined;
        return data ? [{ updatedAt: query.state.dataUpdatedAt, pages: 'pages' in data ? data.pages : [data] }] : [];
      }));
  }, [cache, snapshot]);
}
