export type WhatsappIdentity = {
  phoneNumber?: string | null;
  businessScopedUserId?: string | null;
  parentBusinessScopedUserId?: string | null;
  username?: string | null;
  contactName?: string | null;
};

export type RecipientAddress = { to: string; recipient?: never } | { to?: never; recipient: string };

export function getRecipientAddress(identity: WhatsappIdentity): RecipientAddress | undefined {
  const bsuid = identity.businessScopedUserId?.trim();
  if (bsuid) return { recipient: bsuid };
  const phone = identity.phoneNumber?.trim();
  if (phone) return { to: phone };
  const parent = identity.parentBusinessScopedUserId?.trim();
  if (parent) return { recipient: parent };
  return undefined;
}

export function getIdentityLabel(identity: WhatsappIdentity): string {
  return identity.contactName?.trim() ||
    (identity.username?.trim() ? `@${identity.username.trim().replace(/^@/, '')}` : '') ||
    identity.phoneNumber?.trim() || identity.businessScopedUserId?.trim() ||
    identity.parentBusinessScopedUserId?.trim() || 'Unknown contact';
}

export function getIdentitySecondaryLabel(identity: WhatsappIdentity): string {
  return identity.phoneNumber?.trim() || identity.businessScopedUserId?.trim() ||
    identity.parentBusinessScopedUserId?.trim() || '';
}

// A phone may link older records to a known BSUID only when that link is unambiguous
// within the selected business number. Opaque IDs are kept verbatim.
export function buildIdentityKeys<T extends WhatsappIdentity & { id: string; phoneNumberId: string }>(records: T[]): Map<string, string> {
  const aliases = new Map<string, Set<string>>();
  function aliasKey(record: T, kind: string, value: string): string {
    return JSON.stringify([record.phoneNumberId, kind, value]);
  }
  for (const record of records) {
    if (!record.businessScopedUserId) continue;
    for (const [kind, value] of [
      ['phone', record.phoneNumber?.replace(/\D/g, '')],
      ['parent', record.parentBusinessScopedUserId],
    ] as const) {
      if (!value) continue;
      const key = aliasKey(record, kind, value);
      const ids = aliases.get(key) ?? new Set<string>();
      ids.add(record.businessScopedUserId);
      aliases.set(key, ids);
    }
  }
  return new Map(records.map(record => {
    const phone = record.phoneNumber?.replace(/\D/g, '');
    let bsuid = record.businessScopedUserId;
    if (!bsuid) {
      for (const [kind, value] of [['phone', phone], ['parent', record.parentBusinessScopedUserId]] as const) {
        const candidates = value ? aliases.get(aliasKey(record, kind, value)) : undefined;
        if (candidates?.size === 1) {
          bsuid = candidates.values().next().value;
          break;
        }
      }
    }
    const key = bsuid ? ['bsuid', bsuid] : phone ? ['phone', phone] :
      record.parentBusinessScopedUserId ? ['parent', record.parentBusinessScopedUserId] : ['conversation', record.id];
    return [record.id, JSON.stringify([record.phoneNumberId, ...key])];
  }));
}
