import { GraphApiError } from '@kapso/whatsapp-cloud-api';
import { InboxInputError, readErrorRecord, readErrorString, type InboxErrorDetails } from './inbox-errors';

export function inboxErrorResponse(error: unknown, statusOverride?: number): Response {
  const graph = error instanceof GraphApiError ? error : undefined;
  const body = readErrorRecord(graph?.raw);
  const provider = readErrorRecord(body.error);
  const detail = readErrorString(body.detail) ?? readErrorString(provider.message) ?? graph?.details;
  const code = body.code ?? provider.code ?? graph?.code;
  const outcomeUnknown = /result.{0,30}unknown|outcome.{0,30}unknown|do not retry/i.test(detail ?? '') ||
    code === 'thread_control_outcome_unknown' || (error instanceof TypeError && /fetch|network/i.test(error.message));
  const status = statusOverride ?? (error instanceof InboxInputError ? error.status : graph?.httpStatus ?? 500);
  const details: InboxErrorDetails = {
    error: error instanceof Error ? error.message : 'Could not complete the request',
    code: typeof code === 'string' || typeof code === 'number' ? code : undefined,
    detail,
    threadError: readErrorString(body.threadError ?? body.thread_error),
    retryAfterMs: graph?.retry.retryAfterMs,
    requestId: readErrorString(body.requestId ?? body.request_id),
    outcomeUnknown: outcomeUnknown || undefined,
    provider: graph && typeof provider.code === 'number' ? {
      code: provider.code,
      subcode: graph.errorSubcode,
      type: graph.type,
      traceId: graph.fbtraceId,
      details: graph.details,
    } : undefined,
  };
  const headers = details.retryAfterMs === undefined ? undefined : {
    'Retry-After': String(Math.ceil(details.retryAfterMs / 1000)),
  };
  return Response.json(details, { status, headers });
}
