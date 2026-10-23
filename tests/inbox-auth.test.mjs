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
test('fails closed when unsafe requests lack an Origin, even with Fetch Metadata', async () => {
  for (const extraHeaders of [{}, { 'sec-fetch-site': 'same-origin' }]) {
    const response = await authorizeInboxRequest(request('/api/settings', 'POST', { authorization: auth, ...extraHeaders }), env);
    assert.equal(response.status, 403);
  }
});
test('accepts case-insensitive Basic authentication schemes', async () => {
  for (const scheme of ['basic', 'BASIC']) {
    assert.equal(await authorizeInboxRequest(request('/', 'GET', { authorization: `${scheme} ${btoa('demo:dummy-test-password')}` }), env), undefined);
  }
});
test('uses the actual loopback authority when Next normalizes the middleware URL', async () => {
  for (const host of ['127.0.0.1:4000', '[::1]:4000']) {
    const response = await authorizeInboxRequest(new Request('http://localhost:4000/api/settings', { method: 'PUT', headers: { authorization: auth, host, origin: `http://${host}` } }), env);
    assert.equal(response, undefined);
  }
});
test('does not turn loopback normalization into arbitrary-host or cross-origin trust', async () => {
  for (const [host, origin] of [['evil.example:4000', 'http://evil.example:4000'], ['127.0.0.1:4001', 'http://127.0.0.1:4001'], ['user@127.0.0.1:4000', 'http://127.0.0.1:4000'], ['127.0.0.1:4000', 'http://localhost:4000'], ['evil.example:4000', 'http://localhost:4000'], ['127.0.0.1:4001', 'http://localhost:4000']]) {
    const response = await authorizeInboxRequest(new Request('http://localhost:4000/api/settings', { method: 'PUT', headers: { authorization: auth, host, origin } }), env);
    assert.equal(response.status, 403);
  }
});
