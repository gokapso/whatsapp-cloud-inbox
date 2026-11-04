import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchConversationMessages,
  filterMessagesToHistoryFrontier,
  historyFromLatestPage,
  mergeLatestMessagePage,
  mergeOlderMessagePage,
  olderCursorFromPaging,
  selectConversationForOlderPage,
} from '../src/lib/inbox-data.ts';

function message(id, createdAt, extra = {}) {
  return {
    id,
    conversationId: 'conv-1',
    phoneNumberId: 'pn-1',
    direction: 'inbound',
    content: id,
    createdAt,
    phoneNumber: '15551234567',
    hasMedia: false,
    ...extra,
  };
}

function history(messages, extra = {}) {
  return {
    messages,
    olderCursor: 'cursor-older',
    hasMoreOlder: true,
    hasLoadedOlder: true,
    ...extra,
  };
}

test('older cursor is present only when the next page URL and after cursor exist', () => {
  assert.equal(olderCursorFromPaging(undefined), null);
  assert.equal(olderCursorFromPaging({ cursors: { after: 'cursor-1' } }), null);
  assert.equal(olderCursorFromPaging({ next: 'https://example.test/next', cursors: {} }), null);
  assert.equal(olderCursorFromPaging({ next: '   ', cursors: { after: 'cursor-1' } }), null);
  assert.equal(
    olderCursorFromPaging({ next: 'https://example.test/next', cursors: { after: ' cursor-2 ' } }),
    'cursor-2',
  );
});

test('fetchConversationMessages requests the after cursor and keeps paging', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), 'http://inbox.test');
    assert.equal(url.pathname, '/api/messages/conv-1');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('phoneNumberId'), 'pn-1');
    assert.equal(url.searchParams.get('after'), 'cursor-2');
    return Response.json({
      data: [{ id: 'm-old', createdAt: '2024-01-01T00:00:00.000Z', content: 'earlier' }],
      paging: { cursors: { after: 'cursor-3' }, next: 'https://example.test/next' },
    });
  };

  try {
    const page = await fetchConversationMessages('conv-1', {
      phoneNumberId: 'pn-1',
      after: 'cursor-2',
    });
    assert.equal(page.messages[0].conversationId, 'conv-1');
    assert.equal(page.messages[0].phoneNumberId, 'pn-1');
    assert.equal(page.messages[0].content, 'earlier');
    assert.equal(olderCursorFromPaging(page.paging), 'cursor-3');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('latest-page polling keeps older messages and the deep cursor', () => {
  const loaded = history([
    message('m1', '2024-01-01T00:00:00.000Z'),
    message('m2', '2024-01-02T00:00:00.000Z', { status: 'sent' }),
  ]);
  const polled = mergeLatestMessagePage(loaded, {
    messages: [
      message('m2', '2024-01-02T00:00:00.000Z', { status: 'read' }),
      message('m3', '2024-01-03T00:00:00.000Z'),
    ],
    paging: { cursors: { after: 'cursor-new' }, next: 'https://example.test/next' },
  });

  assert.deepEqual(polled.messages.map((item) => item.id), ['m1', 'm2', 'm3']);
  assert.equal(polled.messages[1].status, 'read');
  assert.equal(polled.olderCursor, 'cursor-older');
  assert.equal(polled.hasMoreOlder, true);
  assert.equal(polled.hasLoadedOlder, true);
});

test('latest-page polling refreshes the cursor until an older page is loaded', () => {
  const firstPage = historyFromLatestPage(
    [message('m2', '2024-01-02T00:00:00.000Z')],
    { cursors: { after: 'cursor-1' }, next: 'https://example.test/next' },
  );
  const polled = mergeLatestMessagePage(firstPage, {
    messages: [message('m3', '2024-01-03T00:00:00.000Z')],
    paging: { cursors: { after: 'cursor-2' }, next: 'https://example.test/next' },
  });

  assert.deepEqual(polled.messages.map((item) => item.id), ['m2', 'm3']);
  assert.equal(polled.olderCursor, 'cursor-2');
  assert.equal(polled.hasLoadedOlder, false);
});

test('an empty poll does not drop loaded history', () => {
  const loaded = history([message('m1', '2024-01-01T00:00:00.000Z')]);
  const polled = mergeLatestMessagePage(loaded, { messages: [], paging: undefined });
  assert.equal(polled, loaded);
});

test('a non-overlapping latest page keeps loaded messages and walks back from the new edge', () => {
  const loaded = history([message('m1', '2024-01-01T00:00:00.000Z')]);
  const polled = mergeLatestMessagePage(loaded, {
    messages: [message('m9', '2024-02-01T00:00:00.000Z')],
    paging: { cursors: { after: 'cursor-gap' }, next: 'https://example.test/next' },
  });

  assert.deepEqual(polled.messages.map((item) => item.id), ['m1', 'm9']);
  assert.equal(polled.olderCursor, 'cursor-gap');
  assert.equal(polled.hasLoadedOlder, false);
});

test('older pages prepend, advance the cursor, and stop on a repeated or exhausted page', () => {
  const loaded = history(
    [message('m2', '2024-01-02T00:00:00.000Z', { status: 'read' })],
    { olderCursor: 'cursor-1' },
  );
  const older = mergeOlderMessagePage(loaded, {
    messages: [
      message('m1', '2024-01-01T00:00:00.000Z'),
      message('m2', '2024-01-02T00:00:00.000Z', { status: 'sent' }),
    ],
    paging: { cursors: { after: 'cursor-0' }, next: 'https://example.test/next' },
  });

  assert.deepEqual(older.messages.map((item) => item.id), ['m1', 'm2']);
  assert.equal(older.messages[1].status, 'read');
  assert.equal(older.olderCursor, 'cursor-0');
  assert.equal(older.hasLoadedOlder, true);

  const exhausted = mergeOlderMessagePage(older, {
    messages: [message('m0', '2023-12-31T00:00:00.000Z')],
    paging: { cursors: { after: 'cursor-stale' } },
  });
  assert.equal(exhausted.hasMoreOlder, false);
  assert.equal(exhausted.olderCursor, null);
  assert.equal(exhausted.messages[0].id, 'm0');

  const repeated = mergeOlderMessagePage(older, {
    messages: [message('m1', '2024-01-01T00:00:00.000Z')],
    paging: { cursors: { after: 'cursor-0' }, next: 'https://example.test/next' },
  });
  assert.equal(repeated.hasMoreOlder, false);

  const rewalk = mergeOlderMessagePage(older, {
    messages: [message('m1', '2024-01-01T00:00:00.000Z')],
    paging: { cursors: { after: 'cursor-rewalk' }, next: 'https://example.test/next' },
  });
  assert.equal(rewalk.hasMoreOlder, true);
  assert.equal(rewalk.olderCursor, 'cursor-rewalk');
});

test('older history stays contiguous by paging the newest incomplete conversation', () => {
  const newer = history([message('m3', '2024-03-01T00:00:00.000Z')], { olderCursor: 'cursor-new' });
  const older = history([message('m1', '2024-01-01T00:00:00.000Z')], { olderCursor: 'cursor-old' });
  const exhausted = history([message('m0', '2023-01-01T00:00:00.000Z')], {
    olderCursor: null,
    hasMoreOlder: false,
  });
  const loaded = [
    { conversationId: 'newer', history: newer },
    { conversationId: 'older', history: older },
    { conversationId: 'exhausted', history: exhausted },
  ];

  assert.equal(selectConversationForOlderPage(loaded), 'newer');
  assert.deepEqual(
    filterMessagesToHistoryFrontier(
      [exhausted.messages[0], older.messages[0], newer.messages[0]],
      loaded.map((item) => item.history),
    ).map((item) => item.id),
    ['m3'],
  );

  const newerExhausted = { ...newer, olderCursor: null, hasMoreOlder: false };
  assert.equal(
    selectConversationForOlderPage([
      { conversationId: 'newer', history: newerExhausted },
      { conversationId: 'older', history: older },
    ]),
    'older',
  );
  assert.deepEqual(
    filterMessagesToHistoryFrontier(
      [older.messages[0], newerExhausted.messages[0]],
      [newerExhausted, older],
    ).map((item) => item.id),
    ['m1', 'm3'],
  );
  assert.equal(selectConversationForOlderPage([]), null);
});
