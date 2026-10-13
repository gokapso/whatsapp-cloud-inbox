import { it } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinServiceWindow } from '../src/lib/service-window';
import type { Message } from '../src/lib/inbox-data';

const now = Date.parse('2026-10-02T12:00:00Z');
it('uses the backend inbound timestamp when recent history contains only outbound messages', () => {
  assert.equal(isWithinServiceWindow([], '2026-10-02T11:00:00Z', now), true);
});
it('closes the service window at 24 hours and rejects missing or future timestamps', () => {
  assert.equal(isWithinServiceWindow([], '2026-10-01T12:00:00Z', now), false);
  assert.equal(isWithinServiceWindow([], undefined, now), false);
  assert.equal(isWithinServiceWindow([], 'invalid', now), false);
  assert.equal(isWithinServiceWindow([], '2026-10-03T12:00:00Z', now), false);
});
it('uses a newer loaded inbound message while the list snapshot is catching up', () => {
  const message: Message = { id: 'inbound', conversationId: 'conv', phoneNumberId: 'number', direction: 'inbound',
    content: 'Hi', createdAt: '2026-10-02T11:00:00Z', hasMedia: false };
  assert.equal(isWithinServiceWindow([message], '2026-10-01T11:00:00Z', now), true);
});
