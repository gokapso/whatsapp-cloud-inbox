import { Check, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MessageStatusChecks({ status, className }: { status: string; className?: string }) {
  if (status === 'read' || status === 'delivered') {
    return (
      <span aria-label={status === 'read' ? 'Read' : 'Delivered'} className={cn('relative inline-flex h-3.5 w-[1.125rem] items-center text-[var(--chat-check)]', className)}>
        <Check aria-hidden="true" className="absolute left-0 top-0 size-3.5" />
        <Check aria-hidden="true" className="absolute right-0 top-0 size-3.5" />
      </span>
    );
  }
  if (status === 'sent' || status === 'outgoing') {
    return <Check aria-label={status === 'sent' ? 'Sent' : 'Outgoing message (delivery status unavailable)'} className={cn('size-3.5 text-[var(--chat-check)]', className)} />;
  }
  if (status === 'failed') {
    return <XCircle aria-label="Failed" className={cn('size-3.5 text-red-500', className)} />;
  }
  return null;
}
