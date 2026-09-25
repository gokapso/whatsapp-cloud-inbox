import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';

// Previous media send flow used PHONE_NUMBER_ID and Kapso media upload methods.
// Evolution text sending is active now; media support can be wired here when the
// Evolution API exposes upload/send media endpoints.
//
// import { PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const to = formData.get('to') as string;
    const body = formData.get('body') as string;
    const file = formData.get('file') as File | null;

    if (!to) {
      return NextResponse.json(
        { error: 'Missing required field: to' },
        { status: 400 }
      );
    }

    if (file) {
      return NextResponse.json(
        { error: 'Evolution API media sending is not configured yet' },
        { status: 400 }
      );
    }

    if (!body) {
      return NextResponse.json(
        { error: 'Missing required field: body' },
        { status: 400 }
      );
    }

    const result = await whatsappClient.messages.sendText({
      to,
      body
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
