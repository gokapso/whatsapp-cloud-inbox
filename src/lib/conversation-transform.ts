import type { ConversationKapsoExtensions, ConversationRecord } from '@kapso/whatsapp-cloud-api';
import type { Conversation } from './inbox-data';
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

export function transformConversation(conversation: ConversationRecord, sourcePhoneNumber: KapsoPhoneNumber): Conversation {
  const kapso = conversation.kapso;

  const lastMessageText = typeof kapso?.lastMessageText === 'string' ? kapso.lastMessageText : undefined;
  const lastMessageType = typeof kapso?.lastMessageType === 'string' ? kapso.lastMessageType : undefined;

  return {
    id: conversation.id,
    phoneNumber: conversation.phoneNumber,
    businessScopedUserId: typeof conversation.businessScopedUserId === 'string' ? conversation.businessScopedUserId : undefined,
    parentBusinessScopedUserId: typeof conversation.parentBusinessScopedUserId === 'string' ? conversation.parentBusinessScopedUserId : undefined,
    username: typeof conversation.username === 'string' ? conversation.username : undefined,
    lastInboundAt: kapso?.lastInboundAt,
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
}
