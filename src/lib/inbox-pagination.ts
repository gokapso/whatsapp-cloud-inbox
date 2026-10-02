import type { GraphPaging } from '@kapso/whatsapp-cloud-api';
import { InboxInputError } from './inbox-errors';

export type NumberCursors = Record<string, string | null>;
export type MessagePageCursor = { conversationId: string; after?: string };

export function nextGraphCursor(paging?: GraphPaging): string | undefined {
  return paging?.next && paging.cursors.after ? paging.cursors.after : undefined;
}

export function readNumberCursors(cursor: string | null, phoneNumberIds: string[]): NumberCursors {
  if (!cursor) return {};
  if (cursor.length > 16000) throw new InboxInputError('Conversation cursor is too long');
  let parsed: unknown;
  try { parsed = JSON.parse(cursor); } catch { throw new InboxInputError('Invalid conversation cursor'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new InboxInputError('Invalid conversation cursor');
  for (const [id, after] of Object.entries(parsed)) {
    if (!phoneNumberIds.includes(id) || (after !== null && typeof after !== 'string')) {
      throw new InboxInputError('Conversation cursor does not match the selected numbers. Refresh the list.');
    }
  }
  return parsed as NumberCursors;
}

export function nextThreadPage(conversationIds: string[], conversationId: string, paging?: GraphPaging): MessagePageCursor | undefined {
  const after = nextGraphCursor(paging);
  if (after) return { conversationId, after };
  const nextId = conversationIds[conversationIds.indexOf(conversationId) + 1];
  return nextId ? { conversationId: nextId } : undefined;
}
