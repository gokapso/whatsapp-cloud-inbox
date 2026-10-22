import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeInboxRequest } from '../src/lib/inbox-auth.ts';

const env = { INBOX_AUTH_USERNAME: 'demo', INBOX_AUTH_PASSWORD: 'dummy-test-password' };
const auth = `Basic ${btoa('demo:dummy-test-password')}`;
const request = (path, method = 'GET', headers = {}) => new Request(`https://inbox.example${path}`, { method, headers });

for (const path of ['/', '/settings', '/api/settings', '/api/messages/send', '/api/messages/interactive', '/api/templates/send', '/api/media/123', '/api/conversations', '/api/phone-numbers']) {
  test(`rejects unauthenticated access to ${path}`, async () => {
    const denied = await authorizeInboxRequest(request(path), env);
    assert.equal(denied.status, 401);
    assert.equal(denied.headers.get('cache-control'), 'private, no-store');
    assert.match(denied.headers.get('www-authenticate'), /^Basic /);
  });
}
test('fails closed without complete configuration', async () => {
  for (const config of [{}, { INBOX_AUTH_USERNAME: 'demo' }, { ...env, INBOX_AUTH_USERNAME: 'a:b' }]) {
    assert.equal((await authorizeInboxRequest(request('/'), config)).status, 503);
  }
});
test('rejects malformed, wrong, and bearer credentials', async () => {
  for (const authorization of ['Basic !!!', 'Basic ' + btoa('demo:wrong'), 'Bearer dummy']) {
    assert.equal((await authorizeInboxRequest(request('/', 'GET', { authorization }), env)).status, 401);
  }
});
test('accepts authenticated reads and same-origin mutations', async () => {
  assert.equal(await authorizeInboxRequest(request('/', 'GET', { authorization: auth }), env), undefined);
  assert.equal(await authorizeInboxRequest(request('/api/messages/send', 'POST', { authorization: auth, origin: 'https://inbox.example' }), env), undefined);
});
test('blocks cross-origin browser mutations even with valid credentials', async () => {
  for (const headers of [{ origin: 'https://other.example' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await authorizeInboxRequest(request('/api/messages/send', 'POST', { authorization: auth, ...headers }), env)).status, 403);
  }
});
test('accepts UTF-8 credentials as advertised by the challenge', async () => {
  const unicodeEnv = { INBOX_AUTH_USERNAME: 'Andrés', INBOX_AUTH_PASSWORD: 'dummy-contraseña' };
  const authorization = 'Basic ' + Buffer.from('Andrés:dummy-contraseña', 'utf8').toString('base64');
  assert.equal(await authorizeInboxRequest(request('/', 'GET', { authorization }), unicodeEnv), undefined);
});
