import { NextResponse } from 'next/server';
import { buildKapsoFields } from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const response = await whatsappClient.conversations.list({
      phoneNumberId: PHONE_NUMBER_ID,
      ...(status && { status: status as 'active' | 'ended' }),
      limit,
      fields: buildKapsoFields([
        'contact_name',
        'messages_count',
        'last_message_type',
        'last_message_text',
        'last_inbound_at',
        'last_outbound_at'
      ])
    });

    // Transform conversations to match frontend expectations
    const transformedData = response.data.map((conv: any) => ({
      id: conv.id,
      phoneNumber: conv.phoneNumber,
      status: conv.status,
      lastActiveAt: conv.lastActiveAt,
      phoneNumberId: conv.phoneNumberId || PHONE_NUMBER_ID,
      metadata: conv.metadata || {},
      contactName: conv.kapso?.contactName,
      messagesCount: conv.kapso?.messagesCount,
      lastMessage: conv.kapso?.lastMessageText ? {
        content: conv.kapso.lastMessageText,
        direction: conv.kapso.lastInboundAt && conv.kapso.lastOutboundAt
          ? (new Date(conv.kapso.lastInboundAt) > new Date(conv.kapso.lastOutboundAt) ? 'inbound' : 'outbound')
          : conv.kapso.lastInboundAt ? 'inbound' : 'outbound',
        type: conv.kapso.lastMessageType
      } : undefined
    }));

    return NextResponse.json({
      data: transformedData,
      paging: response.paging
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
