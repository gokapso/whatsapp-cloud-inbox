import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jid = typeof body.jid === 'string' ? body.jid : undefined;

    if (!jid) {
      return NextResponse.json(
        { error: 'Missing required field: jid' },
        { status: 400 }
      );
    }

    const result = await whatsappClient.conversations.markAsRead({ jid });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark conversation as read' },
      { status: 500 }
    );
  }
}
