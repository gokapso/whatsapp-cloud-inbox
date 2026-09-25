import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';

// Previous Kapso conversation mapping kept for reference.
//
// import {
//   buildKapsoFields,
//   type ConversationKapsoExtensions,
//   type ConversationRecord
// } from '@kapso/whatsapp-cloud-api';
// import { PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
//
// function parseDirection(kapso?: ConversationKapsoExtensions): 'inbound' | 'outbound' {
//   if (!kapso) {
//     return 'inbound';
//   }
//
//   const inboundAt = typeof kapso.lastInboundAt === 'string' ? Date.parse(kapso.lastInboundAt) : Number.NaN;
//   const outboundAt = typeof kapso.lastOutboundAt === 'string' ? Date.parse(kapso.lastOutboundAt) : Number.NaN;
//
//   if (Number.isFinite(inboundAt) && Number.isFinite(outboundAt)) {
//     return inboundAt >= outboundAt ? 'inbound' : 'outbound';
//   }
//
//   if (Number.isFinite(inboundAt)) return 'inbound';
//   if (Number.isFinite(outboundAt)) return 'outbound';
//   return 'inbound';
// }

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;

    const response = await whatsappClient.conversations.list({
      limit
    });

    return NextResponse.json({
      data: response.data,
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
