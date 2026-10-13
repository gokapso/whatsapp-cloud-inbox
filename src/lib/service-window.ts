import type { Message } from './inbox-data';

export function isWithinServiceWindow(messages: Message[], lastInboundAt?: string, now = Date.now()): boolean {
  let latest = lastInboundAt ? Date.parse(lastInboundAt) : -Infinity;
  if (!Number.isFinite(latest)) latest = -Infinity;
  for (const message of messages) {
    if (message.direction !== 'inbound') continue;
    const timestamp = Date.parse(message.createdAt);
    if (Number.isFinite(timestamp)) latest = Math.max(latest, timestamp);
  }
  return Number.isFinite(latest) && now - latest >= 0 && now - latest < 24 * 60 * 60 * 1000;
}
