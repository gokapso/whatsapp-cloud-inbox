import { InboxInputError } from './inbox-errors';
import type { RecipientAddress } from './whatsapp-identity';

export function readRecipientAddress(input: { to?: unknown; recipient?: unknown }): RecipientAddress {
  const to = typeof input.to === 'string' ? input.to.trim() : '';
  const recipient = typeof input.recipient === 'string' ? input.recipient.trim() : '';
  if (Boolean(to) === Boolean(recipient)) throw new InboxInputError('Provide either a phone number or a BSUID recipient');
  if (recipient) {
    if (!/^[A-Za-z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/.test(recipient)) throw new InboxInputError('Invalid BSUID recipient');
    return { recipient };
  }
  return { to };
}
