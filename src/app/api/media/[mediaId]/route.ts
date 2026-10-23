import { NextResponse } from 'next/server';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params;
  if (!/^[A-Za-z0-9_-]+$/.test(mediaId)) {
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const configuredPhoneNumber = await resolvePhoneNumberContext(searchParams.get('phoneNumberId') ?? undefined);
    const phoneNumberId = configuredPhoneNumber.phone_number_id;

    // Get metadata for mime type
    const metadata = await whatsappClient.media.get({
      mediaId,
      phoneNumberId
    });

    const buffer = await whatsappClient.media.download({
      mediaId,
      phoneNumberId,
      // SDK 0.4 prefers downloadUrl: authenticate trusted Kapso hosts, skip public CDNs.
      auth: 'auto'
    });

    // If buffer is a Response, return it directly
    if (buffer instanceof Response) {
      return buffer;
    }

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    return configurationErrorResponse(error);
  }
}
