import { cookies } from 'next/headers';
import type { InboxSettings, KapsoPhoneNumber } from '@/types/settings';

export const INBOX_SETTINGS_COOKIE = 'whatsapp-cloud-inbox-settings';

const PHONE_NUMBERS_CACHE_TTL_MS = 60_000;

type PlatformPhoneNumbersResponse = {
  data?: KapsoPhoneNumber[];
  meta?: {
    page?: number;
    per_page?: number;
    total_pages?: number;
    total_count?: number;
  };
};

type PhoneNumbersCache = {
  expiresAt: number;
  data: KapsoPhoneNumber[];
};

let phoneNumbersCache: PhoneNumbersCache | null = null;

export class InboxConfigurationError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'InboxConfigurationError';
    this.status = status;
  }
}

function getKapsoApiBaseUrl(): string {
  const explicitBaseUrl = process.env.KAPSO_API_BASE_URL || process.env.KAPSO_PLATFORM_API_URL;
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/platform\/v1\/?$/, '').replace(/\/$/, '');
  }

  const whatsappApiUrl = process.env.WHATSAPP_API_URL;
  if (whatsappApiUrl) {
    try {
      return new URL(whatsappApiUrl).origin;
    } catch {
      return 'https://api.kapso.ai';
    }
  }

  return 'https://api.kapso.ai';
}

function platformApiUrl(path: string): string {
  return `${getKapsoApiBaseUrl()}/platform/v1${path}`;
}

function getKapsoApiKey(): string {
  const apiKey = process.env.KAPSO_API_KEY;
  if (!apiKey) {
    throw new InboxConfigurationError('KAPSO_API_KEY environment variable is not set', 500);
  }
  return apiKey;
}

function getEnvFallbackPhoneNumber(): KapsoPhoneNumber | null {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;

  return {
    id: phoneNumberId,
    phone_number_id: phoneNumberId,
    business_account_id: process.env.WABA_ID,
    display_name: 'Configured phone number',
    status: 'CONNECTED'
  };
}

function uniqueIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  return Array.from(
    new Set(
      ids
        .filter((id): id is string => typeof id === 'string')
        .map(id => id.trim())
        .filter(Boolean)
    )
  );
}

function defaultSelectedPhoneNumberIds(phoneNumbers: KapsoPhoneNumber[]): string[] {
  const envPhoneNumberId = process.env.PHONE_NUMBER_ID;
  const availableIds = new Set(phoneNumbers.map(number => number.phone_number_id));

  if (envPhoneNumberId && availableIds.has(envPhoneNumberId)) {
    return [envPhoneNumberId];
  }

  const inboxReadyNumbers = phoneNumbers.filter(number =>
    number.phone_number_id &&
    number.status === 'CONNECTED' &&
    number.inbound_processing_enabled !== false
  );

  if (inboxReadyNumbers.length > 0) {
    return inboxReadyNumbers.map(number => number.phone_number_id);
  }

  return phoneNumbers
    .map(number => number.phone_number_id)
    .filter(Boolean);
}

export function sanitizeInboxSettings(
  settings: InboxSettings | null,
  phoneNumbers: KapsoPhoneNumber[]
): InboxSettings {
  const availableIds = new Set(phoneNumbers.map(number => number.phone_number_id));
  const selectedPhoneNumberIds = settings
    ? uniqueIds(settings.selectedPhoneNumberIds).filter(id => availableIds.has(id))
    : defaultSelectedPhoneNumberIds(phoneNumbers);

  const requestedDefaultPhoneNumberId = settings?.defaultPhoneNumberId?.trim();
  const defaultPhoneNumberId =
    requestedDefaultPhoneNumberId && selectedPhoneNumberIds.includes(requestedDefaultPhoneNumberId)
      ? requestedDefaultPhoneNumberId
      : selectedPhoneNumberIds[0];

  return {
    selectedPhoneNumberIds,
    ...(defaultPhoneNumberId && { defaultPhoneNumberId })
  };
}

export function serializeInboxSettings(settings: InboxSettings): string {
  return encodeURIComponent(JSON.stringify(settings));
}

export function parseInboxSettingsCookie(value?: string): InboxSettings | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<InboxSettings>;
    const selectedPhoneNumberIds = uniqueIds(parsed.selectedPhoneNumberIds);
    const defaultPhoneNumberId =
      typeof parsed.defaultPhoneNumberId === 'string' && parsed.defaultPhoneNumberId.trim()
        ? parsed.defaultPhoneNumberId.trim()
        : undefined;

    return {
      selectedPhoneNumberIds,
      ...(defaultPhoneNumberId && { defaultPhoneNumberId })
    };
  } catch {
    return null;
  }
}

export async function readStoredInboxSettings(): Promise<InboxSettings | null> {
  const cookieStore = await cookies();
  return parseInboxSettingsCookie(cookieStore.get(INBOX_SETTINGS_COOKIE)?.value);
}

export async function fetchKapsoPhoneNumbers(options: { force?: boolean } = {}): Promise<KapsoPhoneNumber[]> {
  if (!options.force && phoneNumbersCache && phoneNumbersCache.expiresAt > Date.now()) {
    return phoneNumbersCache.data;
  }

  const apiKey = getKapsoApiKey();
  const collectedPhoneNumbers: KapsoPhoneNumber[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL(platformApiUrl('/whatsapp/phone_numbers'));
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');

    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new InboxConfigurationError(
        details || `Failed to fetch WhatsApp phone numbers (${response.status})`,
        response.status
      );
    }

    const payload = await response.json() as PlatformPhoneNumbersResponse;
    collectedPhoneNumbers.push(...(payload.data ?? []));

    totalPages = payload.meta?.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);

  phoneNumbersCache = {
    expiresAt: Date.now() + PHONE_NUMBERS_CACHE_TTL_MS,
    data: collectedPhoneNumbers
  };

  return collectedPhoneNumbers;
}

export async function getAvailablePhoneNumbers(options: { force?: boolean } = {}): Promise<KapsoPhoneNumber[]> {
  try {
    const phoneNumbers = await fetchKapsoPhoneNumbers(options);
    if (phoneNumbers.length > 0) {
      return phoneNumbers;
    }
  } catch (error) {
    const fallback = getEnvFallbackPhoneNumber();
    if (fallback) {
      return [fallback];
    }
    throw error;
  }

  const fallback = getEnvFallbackPhoneNumber();
  return fallback ? [fallback] : [];
}

export async function getTrackedPhoneNumbers(): Promise<{
  phoneNumbers: KapsoPhoneNumber[];
  settings: InboxSettings;
  hasStoredSettings: boolean;
}> {
  const [phoneNumbers, storedSettings] = await Promise.all([
    getAvailablePhoneNumbers(),
    readStoredInboxSettings()
  ]);
  const settings = sanitizeInboxSettings(storedSettings, phoneNumbers);

  return {
    phoneNumbers,
    settings,
    hasStoredSettings: Boolean(storedSettings)
  };
}

export async function resolvePhoneNumberContext(phoneNumberId?: string): Promise<KapsoPhoneNumber> {
  const { phoneNumbers, settings } = await getTrackedPhoneNumbers();
  const requestedPhoneNumberId = phoneNumberId?.trim() || settings.defaultPhoneNumberId;

  if (!requestedPhoneNumberId) {
    throw new InboxConfigurationError('No phone number selected in settings', 400);
  }

  if (!settings.selectedPhoneNumberIds.includes(requestedPhoneNumberId)) {
    throw new InboxConfigurationError('Phone number is not selected in inbox settings', 400);
  }

  const phoneNumber = phoneNumbers.find(number => number.phone_number_id === requestedPhoneNumberId);
  if (!phoneNumber) {
    throw new InboxConfigurationError('Selected phone number was not found in Kapso', 404);
  }

  return phoneNumber;
}

export function configurationErrorResponse(error: unknown): Response {
  const status = error instanceof InboxConfigurationError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Inbox configuration error';

  return Response.json(
    { error: message },
    { status }
  );
}
