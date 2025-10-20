import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

export const whatsappClient = new WhatsAppClient({
  baseUrl: 'https://app.kapso.ai/api/meta/',
  kapsoApiKey: process.env.KAPSO_API_KEY!
});

export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID!;
