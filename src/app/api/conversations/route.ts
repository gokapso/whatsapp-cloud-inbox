import { NextResponse } from 'next/server';
import { buildKapsoFields } from '@kapso/whatsapp-cloud-api';
import { configurationErrorResponse, getTrackedPhoneNumbers } from '@/lib/inbox-settings';
import { transformConversation } from '@/lib/conversation-transform';
import { nextGraphCursor, readNumberCursors, type NumberCursors } from '@/lib/inbox-pagination';
import { whatsappClient } from '@/lib/whatsapp-client';
import type { KapsoPhoneNumber } from '@/types/settings';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 50;
    const { phoneNumbers, settings } = await getTrackedPhoneNumbers();
    const selectedNumbers = settings.selectedPhoneNumberIds
      .map(id => phoneNumbers.find(number => number.phone_number_id === id))
      .filter((number): number is KapsoPhoneNumber => Boolean(number));
    const cursors = readNumberCursors(searchParams.get('cursor'), selectedNumbers.map(number => number.phone_number_id));
    const activeNumbers = selectedNumbers.filter(number => cursors[number.phone_number_id] !== null);
    const fields = buildKapsoFields([
      'contact_name', 'messages_count', 'last_message_type', 'last_message_text',
      'last_inbound_at', 'last_outbound_at',
    ]);
    const responses = await Promise.allSettled(activeNumbers.map(number => whatsappClient.conversations.list({
      phoneNumberId: number.phone_number_id,
      ...(status && { status: status as 'active' | 'ended' }),
      after: cursors[number.phone_number_id] || undefined,
      limit,
      fields,
    })));
    if (responses.length && responses.every(result => result.status === 'rejected')) {
      throw (responses[0] as PromiseRejectedResult).reason;
    }
    const nextCursors: NumberCursors = { ...cursors };
    const data = [];
    const partialErrors = [];
    for (const [index, result] of responses.entries()) {
      const number = activeNumbers[index];
      if (result.status === 'fulfilled') {
        data.push(...result.value.data.map(conversation => transformConversation(conversation, number)));
        nextCursors[number.phone_number_id] = nextGraphCursor(result.value.paging) ?? null;
      } else {
        // Preserve failed-number cursors so loading another page retries only that scope.
        nextCursors[number.phone_number_id] = cursors[number.phone_number_id] ?? '';
        partialErrors.push({
          phoneNumberId: number.phone_number_id,
          error: result.reason instanceof Error ? result.reason.message : 'Failed to fetch conversations',
        });
      }
    }
    return NextResponse.json({
      data,
      nextCursor: Object.values(nextCursors).some(after => after !== null) ? JSON.stringify(nextCursors) : undefined,
      partialErrors,
    });
  } catch (error) {
    return configurationErrorResponse(error);
  }
}
