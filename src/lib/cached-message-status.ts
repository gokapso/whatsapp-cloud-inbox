import type { MessagePage } from './inbox-data';

export function messageStatusKey(phoneNumberId: string, messageId: string): string {
  return JSON.stringify([phoneNumberId, messageId]);
}

export function collectCachedMessageStatuses(snapshots: { updatedAt: number; pages: MessagePage[] }[]): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const snapshot of [...snapshots].sort((a, b) => a.updatedAt - b.updatedAt)) {
    // The newest page wins over any overlap in older history.
    for (const page of [...snapshot.pages].reverse()) {
      for (const message of page.data) {
        const key = messageStatusKey(message.phoneNumberId, message.id);
        if (message.direction === 'outbound' && message.status) statuses.set(key, message.status);
        else statuses.delete(key);
      }
    }
  }
  return statuses;
}
