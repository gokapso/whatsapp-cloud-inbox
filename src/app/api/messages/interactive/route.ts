import { readRecipientAddress } from '@/lib/message-recipient';
import { NextResponse } from 'next/server';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phoneNumber, to, recipient, header, body: bodyText, buttons, phoneNumberId: requestedPhoneNumberId } = body;
    const configuredPhoneNumber = await resolvePhoneNumberContext(requestedPhoneNumberId);
    const phoneNumberId = configuredPhoneNumber.phone_number_id;

    const recipientAddress = readRecipientAddress({ to: to || phoneNumber, recipient });

    if (!bodyText || !buttons || buttons.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: body, buttons' },
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
    const payload: Parameters<typeof whatsappClient.messages.sendInteractiveButtons>[0] = {
      phoneNumberId,
      ...recipientAddress,
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
    return configurationErrorResponse(error);
  }
}
