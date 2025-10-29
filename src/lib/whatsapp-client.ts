import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

export const whatsappClient = new WhatsAppClient({
  baseUrl: 'https://api.kapso.ai/meta/whatsapp',
  kapsoApiKey: process.env.KAPSO_API_KEY!,
  graphVersion: 'v24.0'
});

export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID!;
