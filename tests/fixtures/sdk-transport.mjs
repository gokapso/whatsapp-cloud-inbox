// Test-process preload only: block all real outbound traffic and emulate the SDK's provider.
import assert from 'node:assert/strict';
const phoneNumber = { id: '123', phone_number_id: '123', business_account_id: '456', display_name: 'Dummy inbox', display_phone_number: '+15550000002', status: 'CONNECTED' };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const headers = new Headers(init.headers ?? input.headers);
  const method = (init.method ?? input.method ?? 'GET').toUpperCase();
  if (url.origin === 'https://api.kapso.ai' && url.pathname === '/platform/v1/whatsapp/phone_numbers') {
    assert.equal(headers.get('x-api-key'), 'dummy-sdk-key');
    return Response.json({ data: [phoneNumber], meta: { total_pages: 1 } });
  }
  if (url.origin === 'https://api.kapso.ai' && url.pathname.startsWith('/meta/whatsapp/v24.0/')) {
    assert.equal(headers.get('x-api-key'), 'dummy-sdk-key');
    assert.equal(init.redirect, 'error');
    if (url.pathname.endsWith('/123/conversations')) {
      return Response.json({ data: [{ id: 'conversation-1', phone_number: '+15550000001', phone_number_id: '123', status: 'active', kapso: { contact_name: 'Dummy contact', messages_count: 2 } }] });
    }
    if (url.pathname.endsWith('/123/messages') && method === 'GET') {
      assert.equal(url.searchParams.get('conversation_id'), 'conversation-1');
      return Response.json({ data: [] });
    }
    if (url.pathname.endsWith('/456/message_templates')) {
      return Response.json({ data: [{ id: 'template-1', name: 'dummy_template', language: 'en_US', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Hello {{1}}' }] }] });
    }
    if (url.pathname.endsWith('/123/media') && method === 'POST') {
      assert.equal(init.body.get('messaging_product'), 'whatsapp');
      assert.ok(init.body.get('file').name);
      return Response.json({ id: 'uploaded-1' });
    }
    if (url.pathname.endsWith('/123/messages') && method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.messaging_product, 'whatsapp');
      assert.equal(body.to, '+15550000001');
      assert.ok(['text', 'template', 'interactive', 'image', 'video', 'audio', 'document'].includes(body.type));
      if (body.type === 'template') {
        assert.equal(body.template.name, 'dummy_template');
        assert.equal(body.template.language.code, 'en_US');
        assert.equal(body.template.components.find(component => component.type === 'body').parameters[0].text, 'Dummy');
      }
      if (body.type === 'interactive') assert.equal(body.interactive.type, 'button');
      if (['image', 'video', 'audio', 'document'].includes(body.type)) assert.equal(body[body.type].id, 'uploaded-1');
      return Response.json({ messages: [{ id: 'dummy-message', message_status: body.type }] });
    }
    const mediaId = url.pathname.split('/').at(-1);
    if (['kapso-media', 'cdn-media', 'lookalike-media', 'error-media'].includes(mediaId)) {
      assert.equal(url.searchParams.get('phone_number_id'), '123');
      const metadata = { id: mediaId, mime_type: 'image/png', url: 'https://lookaside.cdnwhatsapp.net/mock-media/cdn-media' };
      if (mediaId !== 'cdn-media') metadata.download_url = `https://${mediaId === 'lookalike-media' ? 'notkapso.ai' : 'api.kapso.ai'}/mock-media/${mediaId}`;
      return Response.json(metadata);
    }
  }
  if (url.pathname.startsWith('/mock-media/') && ['api.kapso.ai', 'lookaside.cdnwhatsapp.net', 'notkapso.ai'].includes(url.hostname)) {
    assert.equal(init.redirect, 'error');
    assert.equal(headers.get('x-api-key'), url.hostname === 'api.kapso.ai' ? 'dummy-sdk-key' : null);
    assert.equal(headers.get('authorization'), null);
    if (url.pathname.endsWith('/error-media')) return new Response('Dummy upstream unavailable', { status: 503 });
    return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'image/png' } });
  }
  throw new Error(`Unexpected outbound fetch blocked by test fixture: ${url.origin}${url.pathname}`);
};
