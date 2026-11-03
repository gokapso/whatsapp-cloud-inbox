import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterConversationThreads } from '../src/lib/inbox-data.ts';

function thread(overrides = {}) {
  return {
    phoneNumber: '15551234567',
    inboxPhoneNumber: '15559876543',
    inboxDisplayName: 'Support Line',
    contactName: 'Ada Lovelace',
    latestConversation: { status: 'active' },
    conversations: [{ id: 'conv-abc-123' }],
    ...overrides,
  };
}

const threads = [
  thread(),
  thread({
    phoneNumber: '19995550100',
    inboxPhoneNumber: '+44 20 7946 0958',
    inboxDisplayName: 'Billing',
    contactName: 'Grace Hopper',
    latestConversation: { status: 'ended' },
    conversations: [{ id: 'conv-ended' }],
  }),
];

const phones = (statusFilter, query) =>
  filterConversationThreads(threads, statusFilter, query).map(item => item.phoneNumber);

test('formatted phone queries match digit-only stored numbers', () => {
  assert.deepEqual(phones('all', '+15551234567'), ['15551234567']);
  assert.deepEqual(phones('all', '+1 (555) 123-4567'), ['15551234567']);
  assert.deepEqual(phones('all', '1 555 123 4567'), ['15551234567']);
  assert.deepEqual(phones('all', '+44 20 7946 0958'), ['19995550100']);
});

test('name, display name, and conversation id search stay case-insensitive includes', () => {
  assert.deepEqual(phones('all', 'ada'), ['15551234567']);
  assert.deepEqual(phones('all', 'support'), ['15551234567']);
  assert.deepEqual(phones('all', 'conv-ended'), ['19995550100']);
  assert.deepEqual(phones('all', 'nobody'), []);
});

test('empty query returns every thread allowed by the status filter', () => {
  assert.deepEqual(phones('all', '   '), ['15551234567', '19995550100']);
  assert.deepEqual(phones('active', ''), ['15551234567']);
  assert.deepEqual(phones('ended', '+44 (20) 7946-0958'), ['19995550100']);
  assert.deepEqual(phones('active', '+15551234567'), ['15551234567']);
  assert.deepEqual(phones('ended', '+15551234567'), []);
});
