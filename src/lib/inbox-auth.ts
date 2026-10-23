/** Shared-password gate for a single-team inbox. Never expose these values to client bundles. */
export async function authorizeInboxRequest(request: Request, env: {
  INBOX_AUTH_USERNAME?: string;
  INBOX_AUTH_PASSWORD?: string;
}): Promise<Response | undefined> {
  const headers = { 'Cache-Control': 'private, no-store' };
  const username = env.INBOX_AUTH_USERNAME;
  const password = env.INBOX_AUTH_PASSWORD;
  if (!username || !password || username.includes(':')) {
    return new Response('Inbox access is not configured', { status: 503, headers });
  }

  let supplied = '';
  const authorization = request.headers.get('authorization');
  const basicCredentials = authorization?.match(/^Basic +(.+)$/i)?.[1];
  if (basicCredentials) {
    try {
      supplied = new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(basicCredentials), character => character.charCodeAt(0))
      );
    } catch { /* Malformed credentials are unauthorized. */ }
  }
  // Compare fixed-length digests so neither credential is compared character by character.
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const expected = await digest(`${username}:${password}`);
  const actual = await digest(supplied);
  let mismatch = 0;
  for (let index = 0; index < expected.length; index++) mismatch |= expected[index] ^ actual[index];
  if (mismatch !== 0) {
    return new Response('Authentication required', {
      status: 401,
      headers: { ...headers, 'WWW-Authenticate': 'Basic realm="WhatsApp Inbox", charset="UTF-8"' },
    });
  }

  // Browsers cache Basic credentials. Prevent cross-site forms from using that ambient authority.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');
    const requestUrl = new URL(request.url);
    let expectedOrigin = requestUrl.origin;
    // Next normalizes loopback IPs to localhost in middleware URLs. Preserve the
    // browser's actual loopback authority without trusting arbitrary forwarded hosts.
    const host = request.headers.get('host');
    if (requestUrl.hostname === 'localhost' && host && host !== requestUrl.host) {
      let validLoopbackAuthority = false;
      try {
        const authority = new URL(`${requestUrl.protocol}//${host}`);
        if ((/^127(?:\.\d{1,3}){3}$/.test(authority.hostname) || authority.hostname === '[::1]' || authority.hostname === 'localhost') &&
            authority.port === requestUrl.port && !authority.username && !authority.password &&
            authority.pathname === '/' && !authority.search && !authority.hash) {
          expectedOrigin = authority.origin;
          validLoopbackAuthority = true;
        }
      } catch { /* Invalid authorities cannot establish a same-origin request. */ }
      if (!validLoopbackAuthority) {
        return new Response('Cross-origin request rejected', { status: 403, headers });
      }
    }
    if (origin !== expectedOrigin || fetchSite === 'cross-site') {
      return new Response('Cross-origin request rejected', { status: 403, headers });
    }
  }
}
