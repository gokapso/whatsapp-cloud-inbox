import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GraphApiError } from '@kapso/whatsapp-cloud-api';
import { inboxErrorResponse } from '../src/lib/inbox-server-errors';
import { getInboxErrorMessage, InboxInputError, InboxRequestError, readInboxResponse } from '../src/lib/inbox-errors';

describe('provider and domain errors', () => {
  it('preserves routing conflict codes that the SDK categorizes as numeric HTTP errors', async () => {
    const raw = { error: 'Thread is not owned', code: 'meta_business_agent_control', thread_error: 'thread_not_owner' };
    const response = inboxErrorResponse(GraphApiError.fromResponse(new Response(null, { status: 409 }), raw));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.code, 'meta_business_agent_control');
    assert.equal(body.threadError, 'thread_not_owner');
  });
  it('preserves rate-limit hints and provider diagnostics without returning the raw envelope', async () => {
    const raw = { error: { message: 'Slow down', code: 130429, type: 'OAuthException', fbtrace_id: 'trace-1' }, secret_debug_field: 'do-not-expose' };
    const response = inboxErrorResponse(GraphApiError.fromResponse(new Response(null, { status: 429, headers: { 'Retry-After': '15' } }), raw));
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '15');
    assert.equal(body.retryAfterMs, 15000);
    assert.equal(body.provider.code, 130429);
    assert.equal(body.provider.traceId, 'trace-1');
    assert.equal(body.raw, undefined);
    assert.equal(JSON.stringify(body).includes('do-not-expose'), false);
  });
  it('preserves service-credit failures', async () => {
    const response = inboxErrorResponse(GraphApiError.fromResponse(new Response(null, { status: 402 }), { error: 'Credits exhausted', code: 'service_credits_exhausted' }));
    const body = await response.json();
    assert.equal(response.status, 402);
    assert.equal(body.code, 'service_credits_exhausted');
  });
  it('marks an unknown outcome for reconciliation and does not invent retry permission', async () => {
    const response = inboxErrorResponse(GraphApiError.fromResponse(new Response(null, { status: 502 }), {
      error: 'Meta API request failed', detail: 'The thread control result is unknown. Do not retry automatically.',
    }));
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(body.outcomeUnknown, true);
    assert.equal(body.retry, undefined);
    assert.match(getInboxErrorMessage(new InboxRequestError(502, body), 'Failed'), /Refresh.*unknown/);
  });
  it('does not classify an unknown input field as an unknown send outcome', async () => {
    const response = inboxErrorResponse(GraphApiError.fromResponse(new Response(null, { status: 400 }), { error: { message: 'Unknown field', code: 100, error_data: { details: 'Unknown field: invalid' } } }));
    assert.equal((await response.json()).outcomeUnknown, undefined);
  });
  it('retains client error details and provides an actionable routing message', async () => {
    await assert.rejects(() => readInboxResponse(Response.json({ error: 'Thread blocked', threadError: 'thread_ownership_unknown' }, { status: 409 })), error => {
      assert.ok(error instanceof InboxRequestError);
      assert.equal(error.status, 409);
      assert.match(getInboxErrorMessage(error, 'Failed'), /check ownership/);
      return true;
    });
  });
  it('returns a malformed recipient as 400 and honors configuration status overrides', () => {
    assert.equal(inboxErrorResponse(new InboxInputError('Invalid recipient')).status, 400);
    assert.equal(inboxErrorResponse(new Error('Select a number'), 422).status, 422);
  });
});
