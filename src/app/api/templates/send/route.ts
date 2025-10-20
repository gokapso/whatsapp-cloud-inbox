import { NextResponse } from 'next/server';
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, templateName, languageCode, components } = body;

    if (!to || !templateName || !languageCode) {
      return NextResponse.json(
        { error: 'Missing required fields: to, templateName, languageCode' },
        { status: 400 }
      );
    }

    // Build template payload
    const templatePayload = buildTemplateSendPayload({
      name: templateName,
      language: languageCode,
      ...(components || {})
    });

    // Send template message
    const result = await whatsappClient.messages.sendTemplate({
      phoneNumberId: PHONE_NUMBER_ID,
      to,
      template: templatePayload
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending template:', error);
    return NextResponse.json(
      { error: 'Failed to send template message' },
      { status: 500 }
    );
  }
}
