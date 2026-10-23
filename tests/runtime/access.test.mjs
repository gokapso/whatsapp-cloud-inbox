import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// A built local app, dummy inbox credentials, and no provider credentials.
const cwd = fileURLToPath(new URL('../../', import.meta.url));
const port = 16471;
let server;
let stderr = "";
const base = `http://127.0.0.1:${port}`;
const authorization = 'Basic ' + btoa('demo:dummy-test-password');
before(async () => {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', INBOX_AUTH_USERNAME: 'demo', INBOX_AUTH_PASSWORD: 'dummy-test-password' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Local server startup timed out')), 15000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Local server exited ${code}: ${stderr}`)); });
    server.stdout.on('data', data => { if (String(data).includes('Ready')) { clearTimeout(timeout); resolve(); } });
    server.stderr.on('data', data => { stderr += String(data); if (String(data).includes('EADDRINUSE')) { clearTimeout(timeout); reject(new Error(String(data))); } });
  });
});
after(async () => { if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); } });
for (const [path, method] of [
  ['/', 'GET'], ['/settings', 'GET'], ['/api/settings', 'GET'], ['/api/settings', 'POST'],
  ['/api/conversations', 'GET'], ['/api/messages/example', 'GET'], ['/api/templates', 'GET'], ['/api/phone-numbers', 'GET'],
  ['/api/media/123', 'GET'], ['/api/messages/send', 'POST'], ['/api/messages/interactive', 'POST'], ['/api/templates/send', 'POST'],
]) {
  test(`${method} ${path} rejects unauthenticated callers before provider access`, async () => {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  });
}
test('middleware rejects a spoofed internal subrequest header', async () => {
  const response = await fetch(base + '/api/messages/send', { method: 'POST', headers: { 'x-middleware-subrequest': 'src/middleware:src/middleware:src/middleware:src/middleware:src/middleware' } });
  assert.equal(response.status, 401);
});
test('authenticated UI and settings load with private caching', async () => {
  for (const path of ['/', '/settings']) {
    const response = await fetch(base + path, { headers: { authorization } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});
test('authenticated cross-origin mutation is forbidden before route handling', async () => {
  const response = await fetch(base + '/api/messages/send', { method: 'POST', headers: { authorization, origin: 'https://other.example' } });
  assert.equal(response.status, 403);
});
test('invalid media ID is rejected before SDK or provider configuration', async () => {
  const response = await fetch(base + '/api/media/https%3A%2F%2Fexternal.example', { headers: { authorization } });
  assert.equal(response.status, 400);
});
test('authenticated mutation without Origin fails closed', async () => {
  const response = await fetch(base + '/api/settings', { method: 'POST', headers: { authorization, 'sec-fetch-site': 'same-origin' } });
  assert.equal(response.status, 403);
});
test('image optimizer endpoint also requires authentication', async () => {
  const response = await fetch(base + '/_next/image?url=%2Ffavicon.ico&w=64&q=75');
  assert.equal(response.status, 401);
});
