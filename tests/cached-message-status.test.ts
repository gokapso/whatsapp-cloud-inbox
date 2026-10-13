import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectCachedMessageStatuses, messageStatusKey } from '../src/lib/cached-message-status';
import type { Message } from '../src/lib/inbox-data';

function message(status?: string, phoneNumberId = 'business-one'): Message {
  return { id: 'same-message-id', conversationId: 'conversation-one', phoneNumberId, status,
    direction: 'outbound', content: 'Hello', createdAt: '2026-10-12T12:00:00Z', hasMedia: false };
}

describe('cached conversation preview receipts', () => {
  it('matches exact message IDs within a business number without guessing unloaded receipts', () => {
    const statuses = collectCachedMessageStatuses([{ updatedAt: 1, pages: [{ data: [message('read'), message('sent', 'business-two')] }] }]);
    assert.equal(statuses.get(messageStatusKey('business-one', 'same-message-id')), 'read');
    assert.equal(statuses.get(messageStatusKey('business-two', 'same-message-id')), 'sent');
    assert.equal(statuses.get(messageStatusKey('business-one', 'unloaded-message')), undefined);
  });
  it('lets fresh polling replace stale and overlapping history statuses', () => {
    const statuses = collectCachedMessageStatuses([
      { updatedAt: 2, pages: [{ data: [message('read')] }] },
      { updatedAt: 1, pages: [{ data: [message('delivered')] }, { data: [message('sent')] }] },
    ]);
    assert.equal(statuses.get(messageStatusKey('business-one', 'same-message-id')), 'read');
  });
  it('does not retain a success receipt when fresh data is failed or lacks a status', () => {
    for (const status of ['failed', undefined]) {
      const statuses = collectCachedMessageStatuses([
        { updatedAt: 1, pages: [{ data: [message('read')] }] },
        { updatedAt: 2, pages: [{ data: [message(status)] }] },
      ]);
      assert.equal(statuses.get(messageStatusKey('business-one', 'same-message-id')), status);
    }
  });
});
