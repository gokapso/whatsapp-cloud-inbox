import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextGraphCursor, nextThreadPage, readNumberCursors } from '../src/lib/inbox-pagination';
import { fetchConversations, fetchConversationMessages } from '../src/lib/inbox-data';

describe('bounded history paging', () => {
  it('advances within one conversation before visiting an older conversation', () => {
    assert.deepEqual(nextThreadPage(['new', 'old'], 'new', { cursors: { after: 'page-2' }, next: 'next-url' }), { conversationId: 'new', after: 'page-2' });
    assert.deepEqual(nextThreadPage(['new', 'old'], 'new', { cursors: {} }), { conversationId: 'old' });
    assert.equal(nextThreadPage(['new', 'old'], 'old', { cursors: {} }), undefined);
  });
  it('does not replay the cursor after the last page', () => {
    assert.equal(nextGraphCursor({ cursors: { after: 'end-cursor' }, next: null }), undefined);
  });
  it('keeps per-number cursors, completed scopes and retry scopes', () => {
    assert.deepEqual(readNumberCursors('{"one":"page-2","two":null,"three":""}', ['one', 'two', 'three']), { one: 'page-2', two: null, three: '' });
  });
  it('rejects malformed, oversized and out-of-scope number cursors', () => {
    for (const cursor of ['not-json', '[]', '{"other":"cursor"}', '{"one":4}', 'x'.repeat(16001)]) {
      assert.throws(() => readNumberCursors(cursor, ['one']));
    }
  });
  it('forwards cursors and returns paging and partial failures to the UI', async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async input => {
      requests.push(String(input));
      return Response.json({ data: [], nextCursor: 'number-cursors', partialErrors: [{ phoneNumberId: 'two', error: 'Unavailable' }], paging: { cursors: { after: 'message-cursor' }, next: 'next-url' } });
    }) as typeof fetch;
    try {
      const conversations = await fetchConversations('number-cursor');
      const messages = await fetchConversationMessages('conversation-1', 'number-1', 'older-cursor');
      assert.equal(conversations.nextCursor, 'number-cursors');
      assert.equal(conversations.partialErrors.length, 1);
      assert.equal(messages.paging?.cursors.after, 'message-cursor');
      assert.match(requests[0], /cursor=number-cursor/);
      assert.match(requests[1], /after=older-cursor/);
      assert.equal(requests.length, 2);
    } finally { globalThis.fetch = originalFetch; }
  });
});
