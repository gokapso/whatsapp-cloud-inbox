import { NextResponse } from 'next/server';
import { buildKapsoFields } from '@kapso/whatsapp-cloud-api';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { transformMessage } from '@/lib/message-transform';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const phoneNumber = await resolvePhoneNumberContext(searchParams.get('phoneNumberId') ?? undefined);
    const phoneNumberId = phoneNumber.phone_number_id;

    const response = await whatsappClient.messages.listByConversation({
      phoneNumberId,
      conversationId,
      limit,
      after: searchParams.get('after') || undefined,
      before: searchParams.get('before') || undefined,
      fields: buildKapsoFields([
        'direction',
        'origin',
        'passive',
        'statuses',
        'status',
        'processing_status',
        'phone_number',
        'has_media',
        'media_data',
        'media_url',
        'whatsapp_conversation_id',
        'contact_name',
        'message_type_data',
        'content',
        'flow_response',
        'flow_token',
        'flow_name',
        'order_text'
      ])
    });

    const transformedData = response.data.map(msg => transformMessage(msg, conversationId, phoneNumberId));

    return NextResponse.json({
      data: transformedData,
      paging: response.paging
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    if (error instanceof Error) {
      return configurationErrorResponse(error);
    }
    return NextResponse.json({ error: 'Failed to fetch messages', conversationId }, { status: 500 });
  }
}
