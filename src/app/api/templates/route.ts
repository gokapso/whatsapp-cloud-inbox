import { NextResponse } from 'next/server';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumber = await resolvePhoneNumberContext(searchParams.get('phoneNumberId') ?? undefined);
    const wabaId = phoneNumber.business_account_id || process.env.WABA_ID;

    if (!wabaId) {
      return NextResponse.json(
        { error: 'WABA_ID not configured' },
        { status: 500 }
      );
    }

    const response = await whatsappClient.templates.list({
      businessAccountId: wabaId,
      limit: 100
    });

    return NextResponse.json({
      data: response.data,
      paging: response.paging
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return configurationErrorResponse(error);
  }
}
