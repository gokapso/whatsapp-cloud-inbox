import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const preload = fileURLToPath(new URL('../fixtures/sdk-transport.mjs', import.meta.url));
const base = 'http://127.0.0.1:16472';
const authorization = 'Basic ' + btoa('demo:dummy-test-password');
let server;
let stderr = '';
before(async () => {
  server = spawn(process.execPath, ['--import', preload, 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '16472'], {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', INBOX_AUTH_USERNAME: 'demo', INBOX_AUTH_PASSWORD: 'dummy-test-password', KAPSO_API_KEY: 'dummy-sdk-key', PHONE_NUMBER_ID: '123', WABA_ID: '456' },
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mocked inbox startup timed out')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Mocked inbox exited ${code}: ${stderr}`)); });
    server.stdout.on('data', data => { if (String(data).includes('Ready')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', data => { stderr += String(data); });
  });
});
after(async () => { if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });
const request = (path, init = {}) => fetch(base + path, { ...init, headers: { authorization, origin: base, ...init.headers } });
const post = (path, body) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('reads and transforms SDK 0.4.0 conversations', async () => {
  const response = await request('/api/conversations');
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.equal((await response.json()).data[0].contactName, 'Dummy contact');
});
test('reads SDK 0.4.0 conversation message history', async () => {
  const response = await request('/api/messages/conversation-1?phoneNumberId=123');
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.deepEqual((await response.json()).data, []);
});
test('lists SDK 0.4.0 templates', async () => {
  const response = await request('/api/templates?phoneNumberId=123');
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.equal((await response.json()).data[0].name, 'dummy_template');
});
test('serializes text messages through the inbox route', async () => {
  const body = new FormData();
  body.set('to', '+15550000001'); body.set('body', 'Dummy text'); body.set('phoneNumberId', '123');
  const response = await request('/api/messages/send', { method: 'POST', body });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.equal((await response.json()).messages[0].messageStatus, 'text');
});
test('sends the template builder output accepted by SDK 0.4.0', async () => {
  const response = await post('/api/templates/send', { phoneNumberId: '123', to: '+15550000001', templateName: 'dummy_template', languageCode: 'en_US', parameters: ['Dummy'], parameterInfo: { parameters: [{ name: '1', component: 'BODY' }] } });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.equal((await response.json()).messages[0].messageStatus, 'template');
});
test('sends interactive buttons through SDK 0.4.0', async () => {
  const response = await post('/api/messages/interactive', { phoneNumberId: '123', phoneNumber: '+15550000001', body: 'Dummy choice', buttons: [{ id: 'one', title: 'One' }] });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
  assert.equal((await response.json()).messages[0].messageStatus, 'interactive');
});
for (const [mime, extension, expected] of [['image/png', 'png', 'image'], ['video/mp4', 'mp4', 'video'], ['audio/mpeg', 'mp3', 'audio'], ['application/pdf', 'pdf', 'document']]) {
  test(`uploads and sends ${expected} with SDK 0.4.0`, async () => {
    const body = new FormData();
    body.set('phoneNumberId', '123'); body.set('to', '+15550000001'); body.set('file', new Blob(['dummy'], { type: mime }), `dummy.${extension}`);
    const response = await request('/api/messages/send', { method: 'POST', body });
    assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
    assert.equal((await response.json()).messages[0].messageStatus, expected);
  });
}
for (const mediaId of ['kapso-media', 'cdn-media', 'lookalike-media']) {
  test(`uses the correct SDK download auth boundary for ${mediaId}`, async () => {
    const response = await request(`/api/media/${mediaId}?phoneNumberId=123`);
    assert.equal(response.status, 200, response.status === 200 ? undefined : await response.clone().text());
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  });
}
test('does not serve upstream HTTP-error text as media bytes', async () => {
  const response = await request('/api/media/error-media?phoneNumberId=123');
  assert.equal(response.status, 500);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match((await response.json()).error, /Dummy upstream unavailable/);
});
