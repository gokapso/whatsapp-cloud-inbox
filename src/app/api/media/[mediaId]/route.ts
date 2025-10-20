import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params;

    // Get metadata for mime type
    const metadata = await whatsappClient.media.get({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID
    });

    // Test: SDK v0.0.6 has auth parameter - try forcing no auth headers
    console.log('[Media API Test] Trying download with auth: "never"');

    const buffer = await whatsappClient.media.download({
      mediaId,
      phoneNumberId: PHONE_NUMBER_ID,
      auth: 'never' // Force no auth headers for CDN
    });

    console.log('[Media API Test] Download succeeded with auth: "never"', {
      expectedSize: metadata.fileSize,
      actualSize: buffer.byteLength,
      match: buffer.byteLength === metadata.fileSize
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (error) {
    console.error('[Media API] Error:', error);
    const { mediaId: errorMediaId } = await params;
    return NextResponse.json(
      {
        error: 'Failed to fetch media',
        details: error instanceof Error ? error.message : 'Unknown error',
        mediaId: errorMediaId
      },
      { status: 500 }
    );
  }
}
