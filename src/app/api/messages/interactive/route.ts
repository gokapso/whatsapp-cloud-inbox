import { NextResponse } from 'next/server';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, header, body: bodyText, buttons } = body;

    if (!phoneNumber || !bodyText || !buttons || buttons.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: phoneNumber, body, buttons' },
        { status: 400 }
      );
    }

    // Validate buttons
    if (buttons.length > 3) {
      return NextResponse.json(
        { error: 'Maximum 3 buttons allowed' },
        { status: 400 }
      );
    }

    // Build interactive button message payload
    const payload: {
      phoneNumberId: string;
      to: string;
      bodyText: string;
      header?: { type: 'text'; text: string };
      buttons: Array<{ id: string; title: string }>;
    } = {
      phoneNumberId: PHONE_NUMBER_ID,
      to: phoneNumber,
      bodyText,
      buttons: buttons.map((btn: { id: string; title: string }) => ({
        id: btn.id,
        title: btn.title.substring(0, 20) // Ensure max 20 chars
      }))
    };

    // Add header if provided
    if (header) {
      payload.header = {
        type: 'text',
        text: header
      };
    }

    // Send interactive button message
    const result = await whatsappClient.messages.sendInteractiveButtons(payload);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending interactive message:', error);
    return NextResponse.json(
      { error: 'Failed to send interactive message' },
      { status: 500 }
    );
  }
}
