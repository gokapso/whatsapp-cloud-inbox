import { NextResponse, type NextRequest } from 'next/server';
import { authorizeInboxRequest } from './lib/inbox-auth';

export async function middleware(request: NextRequest) {
  const denied = await authorizeInboxRequest(request, {
    INBOX_AUTH_USERNAME: process.env.INBOX_AUTH_USERNAME,
    INBOX_AUTH_PASSWORD: process.env.INBOX_AUTH_PASSWORD,
  });
  if (denied) return denied;
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

// Cover pages, settings, and every API route, including future routes.
export const config = { matcher: ['/((?!_next/static/|favicon.ico$).*)'] };
