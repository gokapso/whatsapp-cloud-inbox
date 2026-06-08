import { NextResponse } from 'next/server';
import {
  INBOX_SETTINGS_COOKIE,
  configurationErrorResponse,
  getAvailablePhoneNumbers,
  getTrackedPhoneNumbers,
  readStoredInboxSettings,
  sanitizeInboxSettings,
  serializeInboxSettings
} from '@/lib/inbox-settings';
import type { InboxSettings } from '@/types/settings';

const SETTINGS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('refresh') === 'true';
    const [phoneNumbers, storedSettings] = await Promise.all([
      getAvailablePhoneNumbers({ force }),
      readStoredInboxSettings()
    ]);
    const settings = sanitizeInboxSettings(storedSettings, phoneNumbers);

    return NextResponse.json({
      phoneNumbers,
      selectedPhoneNumberIds: settings.selectedPhoneNumberIds,
      defaultPhoneNumberId: settings.defaultPhoneNumberId,
      hasStoredSettings: Boolean(storedSettings)
    });
  } catch (error) {
    console.error('Error fetching inbox settings:', error);
    return configurationErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as Partial<InboxSettings>;
    const { phoneNumbers } = await getTrackedPhoneNumbers();
    const settings = sanitizeInboxSettings(
      {
        selectedPhoneNumberIds: Array.isArray(body.selectedPhoneNumberIds)
          ? body.selectedPhoneNumberIds
          : [],
        ...(typeof body.defaultPhoneNumberId === 'string' && {
          defaultPhoneNumberId: body.defaultPhoneNumberId
        })
      },
      phoneNumbers
    );

    const response = NextResponse.json({
      phoneNumbers,
      selectedPhoneNumberIds: settings.selectedPhoneNumberIds,
      defaultPhoneNumberId: settings.defaultPhoneNumberId,
      hasStoredSettings: true
    });

    response.cookies.set(INBOX_SETTINGS_COOKIE, serializeInboxSettings(settings), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SETTINGS_COOKIE_MAX_AGE_SECONDS
    });

    return response;
  } catch (error) {
    console.error('Error saving inbox settings:', error);
    return configurationErrorResponse(error);
  }
}
