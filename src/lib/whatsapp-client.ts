import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';

let _whatsappClient: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!_whatsappClient) {
    const kapsoApiKey = process.env.KAPSO_API_KEY;
    if (!kapsoApiKey) {
      throw new Error('KAPSO_API_KEY environment variable is not set');
    }
    _whatsappClient = new WhatsAppClient({
      baseUrl: 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey,
      graphVersion: 'v24.0'
    });
  }
  return _whatsappClient;
}

// Lazy getter for backwards compatibility
export const whatsappClient = new Proxy({} as WhatsAppClient, {
  get(_, prop) {
    return getWhatsAppClient()[prop as keyof WhatsAppClient];
  }
});

export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
