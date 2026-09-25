// Previous Kapso client kept for reference while the app moves to Evolution API.
//
// import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
//
// let _whatsappClient: WhatsAppClient | null = null;
//
// export function getWhatsAppClient(): WhatsAppClient {
//   if (!_whatsappClient) {
//     const kapsoApiKey = process.env.KAPSO_API_KEY;
//     if (!kapsoApiKey) {
//       throw new Error('KAPSO_API_KEY environment variable is not set');
//     }
//     _whatsappClient = new WhatsAppClient({
//       baseUrl: process.env.WHATSAPP_API_URL || 'https://api.kapso.ai/meta/whatsapp',
//       kapsoApiKey,
//       graphVersion: 'v24.0'
//     });
//   }
//   return _whatsappClient;
// }
//
// export const whatsappClient = new Proxy({} as WhatsAppClient, {
//   get(_, prop) {
//     return getWhatsAppClient()[prop as keyof WhatsAppClient];
//   }
// });

export type EvolutionMessage = {
  id?: string;
  direction?: 'inbound' | 'outbound';
  content?: string;
  createdAt?: string;
  phoneNumber?: string;
  hasMedia?: boolean;
  key?: {
    id?: string;
    fromMe?: boolean;
    remoteJid?: string;
    remoteJidAlt?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; url?: string; mimetype?: string };
    videoMessage?: { caption?: string; url?: string; mimetype?: string };
    audioMessage?: { url?: string; mimetype?: string };
    documentMessage?: {
      caption?: string;
      fileName?: string;
      url?: string;
      mimetype?: string;
    };
  };
  messageTimestamp?: number;
  messageType?: string;
  pushName?: string;
  status?: string;
};

export type EvolutionChat = {
  id?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  contactName?: string;
  remoteJid?: string;
  pushName?: string;
  profilePicUrl?: string;
  lastActiveAt?: string;
  updatedAt?: string;
  unreadCount?: number;
  lastMessage?: EvolutionMessage & {
    content?: string;
    direction?: 'inbound' | 'outbound';
    timestamp?: number;
    type?: string;
  };
};

export type InboxConversation = {
  id: string;
  phoneNumber: string;
  status: string;
  lastActiveAt: string;
  phoneNumberId: string;
  metadata?: Record<string, unknown>;
  contactName?: string;
  messagesCount?: number;
  lastMessage?: {
    content: string;
    direction: 'inbound' | 'outbound';
    type?: string;
  };
};

export type InboxMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  createdAt: string;
  status?: string;
  phoneNumber: string;
  hasMedia: boolean;
  mediaData?: {
    url: string;
    contentType?: string;
    filename?: string;
  };
  filename?: string | null;
  mimeType?: string | null;
  messageType?: string;
  caption?: string | null;
  metadata?: {
    mediaId?: string;
  };
};

type ListResponse<T> = {
  data: T[];
  paging?: unknown;
};

type SendTextInput = {
  to: string;
  body: string;
};

type EvolutionEnvelope<T> = T | { data?: T };

function unwrapData<T>(payload: EvolutionEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data as T;
  }
  return payload as T;
}

function getMessageText(message?: EvolutionMessage): string {
  return (
    message?.message?.conversation ??
    message?.message?.extendedTextMessage?.text ??
    message?.message?.imageMessage?.caption ??
    message?.message?.videoMessage?.caption ??
    message?.message?.documentMessage?.caption ??
    ''
  );
}

function toIsoString(timestamp?: number, fallback?: string): string {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const milliseconds = timestamp > 9999999999 ? timestamp : timestamp * 1000;
    return new Date(milliseconds).toISOString();
  }

  if (fallback && !Number.isNaN(Date.parse(fallback))) {
    return new Date(fallback).toISOString();
  }

  return new Date().toISOString();
}

function normalizeMessageType(type?: string): string {
  if (!type) return 'text';
  return type.replace(/Message$/, '') || type;
}

function getMediaData(message: EvolutionMessage): InboxMessage['mediaData'] {
  const image = message.message?.imageMessage;
  const video = message.message?.videoMessage;
  const audio = message.message?.audioMessage;
  const document = message.message?.documentMessage;
  const media = image ?? video ?? audio ?? document;

  if (!media?.url) {
    return undefined;
  }

  return {
    url: media.url,
    contentType: media.mimetype,
    filename: document?.fileName
  };
}

function normalizeChat(chat: EvolutionChat): InboxConversation {
  const remoteJid = chat.id ?? chat.remoteJid ?? chat.phoneNumberId ?? chat.lastMessage?.key?.remoteJid ?? '';
  const lastMessage = chat.lastMessage;
  const lastMessageTimestamp = lastMessage?.messageTimestamp ?? lastMessage?.timestamp;

  return {
    id: remoteJid,
    phoneNumber: chat.phoneNumber ?? remoteJid.replace(/@.+$/, ''),
    status: 'active',
    lastActiveAt: chat.lastActiveAt ?? toIsoString(lastMessageTimestamp, chat.updatedAt),
    phoneNumberId: chat.phoneNumberId ?? remoteJid ?? PHONE_NUMBER_ID,
    metadata: {
      profilePicUrl: chat.profilePicUrl,
      unreadCount: chat.unreadCount,
      jid: remoteJid
    },
    contactName: chat.contactName ?? chat.pushName,
    messagesCount: undefined,
    lastMessage: lastMessage
      ? {
          content: lastMessage.content ?? getMessageText(lastMessage),
          direction: lastMessage.direction ?? (lastMessage.key?.fromMe ? 'outbound' : 'inbound'),
          type: normalizeMessageType(lastMessage.messageType ?? lastMessage.type)
        }
      : undefined
  };
}

function normalizeMessage(message: EvolutionMessage, conversationId: string): InboxMessage {
  const messageType = normalizeMessageType(message.messageType);
  const mediaData = getMediaData(message);
  const caption =
    message.message?.imageMessage?.caption ??
    message.message?.videoMessage?.caption ??
    message.message?.documentMessage?.caption ??
    null;

  return {
    id: message.key?.id ?? message.id ?? `${conversationId}-${message.messageTimestamp ?? Date.now()}`,
    direction: message.direction ?? (message.key?.fromMe ? 'outbound' : 'inbound'),
    content: message.content ?? getMessageText(message),
    createdAt: message.createdAt ?? toIsoString(message.messageTimestamp),
    status: message.status,
    phoneNumber: message.phoneNumber ?? message.key?.remoteJid ?? message.key?.remoteJidAlt ?? conversationId,
    hasMedia: message.hasMedia ?? Boolean(mediaData),
    mediaData,
    filename: message.message?.documentMessage?.fileName ?? null,
    mimeType: mediaData?.contentType ?? null,
    messageType,
    caption,
    metadata: {
      mediaId: message.id ?? message.key?.id
    }
  };
}

class EvolutionWhatsAppClient {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.EVOLUTION_API_URL || 'http://localhost:3000/api/v1/evolution-api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Evolution API request failed (${response.status}): ${text || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  conversations = {
    list: async ({ limit }: { limit?: number } = {}): Promise<ListResponse<InboxConversation>> => {
      const payload = await this.request<EvolutionEnvelope<EvolutionChat[]>>('/conversations');
      const chats = unwrapData(payload) ?? [];
      const data = chats.map(normalizeChat);

      return {
        data: typeof limit === 'number' ? data.slice(0, limit) : data
      };
    },

    markAsRead: async ({ jid }: { jid: string }) => {
      const token = process.env.EVOLUTION_API_TOKEN;
      const response = await fetch(`${this.baseUrl}/conversations/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ jid }),
        cache: 'no-store'
      });

      if (response.status === 401) {
        return {
          ok: false,
          status: 401,
          message: 'Evolution API read endpoint requires authentication'
        };
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Evolution API request failed (${response.status}): ${text || response.statusText}`);
      }

      return response.json();
    }
  };

  messages = {
    listByConversation: async ({
      conversationId,
      limit
    }: {
      conversationId: string;
      limit?: number;
    }): Promise<ListResponse<InboxMessage>> => {
      const payload = await this.request<EvolutionEnvelope<EvolutionMessage[]>>(
        `/messages/${encodeURIComponent(conversationId)}`
      );
      const messages = unwrapData(payload) ?? [];
      const data = messages.map((message) => normalizeMessage(message, conversationId));

      return {
        data: typeof limit === 'number' ? data.slice(0, limit) : data
      };
    },

    sendText: async ({ to, body }: SendTextInput) => {
      return this.request('/messages', {
        method: 'POST',
        body: JSON.stringify({
          jid: to,
          text: body
        })
      });
    },

    sendInteractiveButtons: async ({
      to,
      bodyText
    }: {
      to: string;
      bodyText: string;
    }) => {
      return this.messages.sendText({ to, body: bodyText });
    },

    sendTemplate: async ({
      to,
      template
    }: {
      to: string;
      template: { name?: string };
    }) => {
      return this.messages.sendText({
        to,
        body: template.name ? `Template: ${template.name}` : 'Template message'
      });
    }
  };

  media = {
    upload: async (input?: unknown) => {
      void input;
      throw new Error('Evolution API media upload is not configured in this client yet');
    },
    get: async (input?: unknown): Promise<{ mimeType?: string }> => {
      void input;
      throw new Error('Evolution API media metadata is not configured in this client yet');
    },
    download: async (input?: unknown): Promise<Response | BodyInit> => {
      void input;
      throw new Error('Evolution API media download is not configured in this client yet');
    }
  };

  templates = {
    list: async (input?: unknown): Promise<ListResponse<never>> => {
      void input;
      return { data: [] };
    }
  };
}

type WhatsAppClient = EvolutionWhatsAppClient;

let _whatsappClient: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!_whatsappClient) {
    _whatsappClient = new EvolutionWhatsAppClient();
  }

  return _whatsappClient;
}

export const whatsappClient = new Proxy({} as WhatsAppClient, {
  get(_, prop) {
    return getWhatsAppClient()[prop as keyof WhatsAppClient];
  }
});

export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
