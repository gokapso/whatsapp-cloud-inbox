import { NextResponse } from 'next/server';
import {
  buildKapsoFields,
  type ConversationKapsoExtensions,
  type ConversationRecord
} from '@kapso/whatsapp-cloud-api';
import { configurationErrorResponse, getTrackedPhoneNumbers } from '@/lib/inbox-settings';
import { whatsappClient } from '@/lib/whatsapp-client';
import type { KapsoPhoneNumber } from '@/types/settings';

function parseDirection(kapso?: ConversationKapsoExtensions): 'inbound' | 'outbound' {
  if (!kapso) {
    return 'inbound';
  }

  const inboundAt = typeof kapso.lastInboundAt === 'string' ? Date.parse(kapso.lastInboundAt) : Number.NaN;
  const outboundAt = typeof kapso.lastOutboundAt === 'string' ? Date.parse(kapso.lastOutboundAt) : Number.NaN;

  if (Number.isFinite(inboundAt) && Number.isFinite(outboundAt)) {
    return inboundAt >= outboundAt ? 'inbound' : 'outbound';
  }

  if (Number.isFinite(inboundAt)) return 'inbound';
  if (Number.isFinite(outboundAt)) return 'outbound';
  return 'inbound';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const { phoneNumbers, settings } = await getTrackedPhoneNumbers();
    const selectedPhoneNumbers = settings.selectedPhoneNumberIds
      .map(phoneNumberId => phoneNumbers.find(number => number.phone_number_id === phoneNumberId))
      .filter((number): number is KapsoPhoneNumber => Boolean(number));

    if (selectedPhoneNumbers.length === 0) {
      return NextResponse.json({
        data: [],
        paging: undefined
      });
    }

    const fields = buildKapsoFields([
      'contact_name',
      'messages_count',
      'last_message_type',
      'last_message_text',
      'last_inbound_at',
      'last_outbound_at'
    ]);

    const responses = await Promise.allSettled(
      selectedPhoneNumbers.map(async (sourcePhoneNumber) => {
        const response = await whatsappClient.conversations.list({
          phoneNumberId: sourcePhoneNumber.phone_number_id,
          ...(status && { status: status as 'active' | 'ended' }),
          limit,
          fields
        });

        return {
          sourcePhoneNumber,
          response
        };
      })
    );

    const successfulResponses = responses.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : []
    );

    if (successfulResponses.length === 0) {
      const failedResponse = responses.find(result => result.status === 'rejected');
      throw failedResponse?.reason ?? new Error('Failed to fetch conversations');
    }

    // Transform conversations to match frontend expectations
    const transformedData = successfulResponses.flatMap(({ response, sourcePhoneNumber }) =>
      response.data.map((conversation: ConversationRecord) => {
        const kapso = conversation.kapso;

        const lastMessageText = typeof kapso?.lastMessageText === 'string' ? kapso.lastMessageText : undefined;
        const lastMessageType = typeof kapso?.lastMessageType === 'string' ? kapso.lastMessageType : undefined;

        return {
          id: conversation.id,
          phoneNumber: conversation.phoneNumber ?? '',
          status: conversation.status ?? 'unknown',
          lastActiveAt: typeof conversation.lastActiveAt === 'string' ? conversation.lastActiveAt : undefined,
          phoneNumberId: conversation.phoneNumberId ?? sourcePhoneNumber.phone_number_id,
          inboxPhoneNumber: sourcePhoneNumber.display_phone_number,
          inboxDisplayName: sourcePhoneNumber.display_name ?? sourcePhoneNumber.verified_name ?? sourcePhoneNumber.name,
          businessAccountId: sourcePhoneNumber.business_account_id,
          metadata: conversation.metadata ?? {},
          contactName: typeof kapso?.contactName === 'string' ? kapso.contactName : undefined,
          messagesCount: typeof kapso?.messagesCount === 'number' ? kapso.messagesCount : undefined,
          lastMessage: lastMessageText
            ? {
                content: lastMessageText,
                direction: parseDirection(kapso),
                type: lastMessageType
              }
            : undefined
        };
      })
    );

    return NextResponse.json({
      data: transformedData,
      partialErrors: responses
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason instanceof Error ? result.reason.message : 'Failed to fetch conversations')
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return configurationErrorResponse(error);
  }
}
