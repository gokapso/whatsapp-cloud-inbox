export type InboxErrorDetails = {
  error: string;
  code?: string | number;
  detail?: string;
  threadError?: string;
  retryAfterMs?: number;
  requestId?: string;
  outcomeUnknown?: boolean;
  provider?: { code?: number; subcode?: number; type?: string; traceId?: string; details?: string };
};

export class InboxInputError extends Error {
  readonly status = 400;
}

export class InboxRequestError extends Error {
  constructor(readonly status: number, readonly details: InboxErrorDetails) {
    super(details.error);
    this.name = 'InboxRequestError';
  }
}

export function readErrorRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return readErrorRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function readErrorString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function readInboxResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const payload = readErrorRecord(body);
    throw new InboxRequestError(response.status, {
      ...payload,
      error: readErrorString(payload.error) || `Request failed (${response.status})`,
    } as InboxErrorDetails);
  }
  if (body === null) throw new Error('The server returned an unreadable response. Refresh before trying again.');
  return body as T;
}

export function getInboxErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof InboxRequestError)) return error instanceof Error ? error.message : fallback;
  const details = error.details;
  const message = details.detail && details.detail !== details.error ? `${details.error}: ${details.detail}` : details.error;
  if (details.outcomeUnknown) return `${message} Refresh the conversation before trying again; the result is unknown.`;
  if (details.threadError || String(details.code).startsWith('thread_') || details.code === 'meta_business_agent_control') {
    return `${message} Refresh the conversation and check ownership in Kapso before replying.`;
  }
  if (details.code === 'service_credits_exhausted' || error.status === 402) return `${message} Check your project's credits in Kapso.`;
  if (error.status === 429) {
    return `${message} ${details.retryAfterMs ? `Wait ${Math.ceil(details.retryAfterMs / 1000)} seconds` : 'Wait a moment'} before trying again.`;
  }
  return message;
}
