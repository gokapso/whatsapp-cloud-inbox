import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import {
  filterConversationThreads, groupConversationsByPhoneNumber, mergeConversations,
  mergeMessagePages, normalizeMessages, type Conversation, type Message,
} from '../src/lib/inbox-data';
import { getIdentityLabel, getRecipientAddress } from '../src/lib/whatsapp-identity';
import { readRecipientAddress } from '../src/lib/message-recipient';
import { transformMessage } from '../src/lib/message-transform';
import { transformConversation } from '../src/lib/conversation-transform';

function conversation(id: string, values: Partial<Conversation> = {}): Conversation {
  return { id, phoneNumberId: 'number-1', status: 'active', ...values };
}
function message(id: string, values: Partial<Message> = {}): Message {
  return { id, conversationId: 'conversation-1', phoneNumberId: 'number-1', direction: 'inbound',
    content: 'Hello', createdAt: '2026-10-01T12:00:00Z', hasMedia: false, messageType: 'text', ...values };
}

describe('recipient identity', () => {
  it('groups phone-less BSUID history and searches usernames and opaque IDs', () => {
    const threads = groupConversationsByPhoneNumber([
      conversation('old', { businessScopedUserId: 'US.opaque123', username: 'test_user' }),
      conversation('new', { businessScopedUserId: 'US.opaque123', username: 'test_user' }),
    ]);
    assert.equal(threads.length, 1);
    assert.equal(threads[0].conversationCount, 2);
    assert.equal(filterConversationThreads(threads, 'all', '@test_user').length, 1);
    assert.equal(filterConversationThreads(threads, 'all', 'US.opaque123').length, 1);
  });
  it('links older phone history to a single known BSUID', () => {
    const threads = groupConversationsByPhoneNumber([
      conversation('old', { phoneNumber: '+1 (555) 111-2222' }),
      conversation('new', { phoneNumber: '15551112222', businessScopedUserId: 'US.opaque123' }),
    ]);
    assert.equal(threads.length, 1);
    assert.deepEqual(getRecipientAddress(threads[0]), { recipient: 'US.opaque123' });
  });
  it('keeps distinct BSUIDs and business numbers separate', () => {
    assert.equal(groupConversationsByPhoneNumber([
      conversation('one', { phoneNumber: '15551112222', businessScopedUserId: 'US.opaque123' }),
      conversation('two', { phoneNumber: '15551112222', businessScopedUserId: 'US.other123' }),
      conversation('phone-only', { phoneNumber: '15551112222' }),
      conversation('other-number', { phoneNumberId: 'number-2', businessScopedUserId: 'US.opaque123' }),
    ]).length, 4);
  });
  it('does not strip BSUID prefixes or change opaque ID case', () => {
    assert.equal(groupConversationsByPhoneNumber([
      conversation('one', { businessScopedUserId: 'US.abc123' }),
      conversation('two', { businessScopedUserId: 'GB.abc123' }),
      conversation('three', { businessScopedUserId: 'US.ABC123' }),
    ]).length, 3);
  });
  it('supports parent-only identity and keeps unidentifiable conversations apart', () => {
    const threads = groupConversationsByPhoneNumber([
      conversation('parent-1', { parentBusinessScopedUserId: 'US.ENT.parent123' }),
      conversation('parent-2', { parentBusinessScopedUserId: 'US.ENT.parent123' }),
      conversation('unknown-1'), conversation('unknown-2'),
    ]);
    assert.equal(threads.length, 3);
    assert.deepEqual(getRecipientAddress({ parentBusinessScopedUserId: 'US.ENT.parent123' }), { recipient: 'US.ENT.parent123' });
  });
  it('prefers a BSUID for sends while retaining phone fallback and human labels', () => {
    assert.deepEqual(getRecipientAddress({ phoneNumber: '15551112222', businessScopedUserId: 'US.opaque123' }), { recipient: 'US.opaque123' });
    assert.deepEqual(getRecipientAddress({ phoneNumber: '15551112222' }), { to: '15551112222' });
    assert.equal(getIdentityLabel({ username: '@test_user' }), '@test_user');
    assert.equal(getIdentityLabel({ contactName: 'Test User', username: 'test_user' }), 'Test User');
    assert.equal(getRecipientAddress({ username: 'test_user' }), undefined);
  });
  it('rejects missing, ambiguous or malformed recipient addresses', () => {
    assert.throws(() => readRecipientAddress({}));
    assert.throws(() => readRecipientAddress({ to: '15551112222', recipient: 'US.opaque123' }));
    assert.throws(() => readRecipientAddress({ recipient: 'invalid' }));
    assert.deepEqual(readRecipientAddress({ recipient: 'US.ENT.parent123' }), { recipient: 'US.ENT.parent123' });
  });
  it('uses the published SDK BSUID field for text, media, template and button messages', async () => {
    const payloads: Record<string, unknown>[] = [];
    const client = new WhatsAppClient({ kapsoApiKey: 'fixture-key', fetch: async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return Response.json({ messages: [{ id: 'fixture-wamid' }] });
    } });
    const base = { phoneNumberId: 'number-1', ...readRecipientAddress({ recipient: 'US.opaque123' }), contextMessageId: 'original-wamid' };
    await client.messages.sendText({ ...base, body: 'Text' });
    await client.messages.sendImage({ ...base, image: { id: 'media-1' } });
    await client.messages.sendVideo({ ...base, video: { id: 'media-1' } });
    await client.messages.sendAudio({ ...base, audio: { id: 'media-1' } });
    await client.messages.sendDocument({ ...base, document: { id: 'media-1' } });
    await client.messages.sendTemplate({ ...base, template: { name: 'hello', language: { code: 'en_US' } } });
    await client.messages.sendInteractiveButtons({ ...base, bodyText: 'Choose', buttons: [{ id: 'yes', title: 'Yes' }] });
    assert.equal(payloads.length, 7);
    for (const payload of payloads) {
      assert.equal(payload.recipient, 'US.opaque123');
      assert.equal(payload.to, undefined);
      assert.deepEqual(payload.context, { message_id: 'original-wamid' });
    }
  });
});

describe('message projection and history', () => {
  it('retains phone-less sender identity, passive origin, structured data and delivery errors', () => {
    const result = transformMessage({ id: 'message-1', type: 'interactive', timestamp: '1790856000',
      fromUserId: 'US.opaque123', fromParentUserId: 'US.ENT.parent123', username: 'test_user',
      interactive: { type: 'nfm_reply' }, kapso: { direction: 'inbound', origin: 'meta_business_agent', passive: true,
        messageTypeData: { type: 'flow' }, flowResponse: { accepted: true }, flowToken: 'flow-token',
        statuses: [{ status: 'failed', errors: [{ code: 131047, message: 'Window closed', errorData: { details: 'Use a template' } }] }] },
    }, 'conversation-1', 'number-1');
    assert.equal(result.phoneNumber, undefined);
    assert.equal(result.businessScopedUserId, 'US.opaque123');
    assert.equal(result.parentBusinessScopedUserId, 'US.ENT.parent123');
    assert.equal(result.username, 'test_user');
    assert.equal(result.origin, 'meta_business_agent');
    assert.equal(result.passive, true);
    assert.deepEqual(result.flowResponse, { accepted: true });
    assert.deepEqual(result.messageTypeData, { type: 'flow' });
    assert.equal(result.deliveryError?.code, 131047);
    assert.equal(result.deliveryError?.details, 'Use a template');
  });
  it('retains rich payloads for later renderers instead of flattening them to text', () => {
    const payload = { id: 'rich', type: 'template', timestamp: '1790856000',
      template: { components: [{ type: 'carousel', cards: [{ cardIndex: 0 }] }] },
      location: { latitude: 1, longitude: 2 }, order: { catalogId: 'catalog-1' },
      contacts: [{ name: { formattedName: 'Fixture User' } }], sticker: { id: 'sticker-1', animated: true },
      context: { id: 'original', referredProduct: { catalogId: 'catalog-1' } },
      kapso: { orderText: 'Order summary' },
    };
    const result = transformMessage(payload, 'conversation-1', 'number-1');
    for (const field of ['template', 'location', 'order', 'contacts', 'sticker', 'context'] as const) {
      assert.deepEqual(result[field], payload[field]);
    }
    assert.equal(result.orderText, 'Order summary');
  });
  it('retains outbound recipient identity without inventing a phone', () => {
    const result = transformMessage({ id: 'out', type: 'text', timestamp: '1790856000', toUserId: 'US.opaque123',
      kapso: { direction: 'outbound', origin: 'other_app' } }, 'conversation-1', 'number-1');
    assert.equal(result.businessScopedUserId, 'US.opaque123');
    assert.equal(result.phoneNumber, undefined);
    assert.equal(result.direction, 'outbound');
  });
  it('retains conversation identity and the backend service-window timestamp', () => {
    const result = transformConversation({ id: 'conv', businessScopedUserId: 'US.opaque123', username: 'test_user',
      kapso: { lastInboundAt: '2026-10-01T12:00:00Z' } }, { id: 'number-1', phone_number_id: 'number-1' });
    assert.equal(result.businessScopedUserId, 'US.opaque123');
    assert.equal(result.username, 'test_user');
    assert.equal(result.phoneNumber, undefined);
    assert.equal(result.lastInboundAt, '2026-10-01T12:00:00Z');
  });
  it('applies reaction removal across pages in timestamp order', () => {
    const result = mergeMessagePages([
      { data: [message('remove', { messageType: 'reaction', reactedToMessageId: 'original', reactionEmoji: '', createdAt: '2026-10-01T12:02:00Z' })] },
      { data: [message('original'), message('react', { messageType: 'reaction', reactedToMessageId: 'original', reactionEmoji: '👍', createdAt: '2026-10-01T12:01:00Z' })] },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].reactionEmoji, null);
  });
  it('resolves quoted messages loaded on another page and deduplicates overlaps', () => {
    const result = mergeMessagePages([
      { data: [message('reply', { contextMessageId: 'original' }), message('original', { status: 'read' })] },
      { data: [message('original', { status: 'sent' })] },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result.find(item => item.id === 'reply')?.repliedTo?.id, 'original');
    assert.equal(result.find(item => item.id === 'original')?.status, 'read');
  });
  it('lets fresh list data replace older overlapping conversation rows', () => {
    const result = mergeConversations([
      { data: [conversation('same', { status: 'ended' })], partialErrors: [] },
      { data: [conversation('same'), conversation('older')], partialErrors: [] },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result.find(item => item.id === 'same')?.status, 'ended');
  });
  it('keeps ordinary message normalization compatible', () => {
    assert.equal(normalizeMessages([message('text')])[0].content, 'Hello');
  });
});
