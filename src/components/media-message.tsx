'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  mediaId: string;
  phoneNumberId?: string;
  messageType: string;
  caption?: string | null;
  filename?: string | null;
  isOutbound?: boolean;
};

export function MediaMessage({ mediaId, phoneNumberId, messageType, caption, filename, isOutbound }: Props) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const handleLoadError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  useEffect(() => {
    // Set the media URL to point to our proxy endpoint
    const params = new URLSearchParams();
    if (phoneNumberId) {
      params.set('phoneNumberId', phoneNumberId);
    }
    setMediaUrl(`/api/media/${mediaId}${params.size ? `?${params.toString()}` : ''}`);
    setLoading(false);
    setLoadFailed(false);
  }, [mediaId, phoneNumberId]);

  if (loading) {
    return (
      <div className="flex h-48 w-full max-w-64 items-center justify-center rounded">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (loadFailed || !mediaUrl) {
    return (
      <div className="flex h-48 w-full max-w-64 items-center justify-center rounded bg-muted">
        <p className={cn('text-sm', isOutbound ? 'text-green-100' : 'text-muted-foreground')}>
          Media unavailable
        </p>
      </div>
    );
  }

  return (
    <div>
      {messageType === 'image' && (
        <img
          src={mediaUrl}
          alt={caption || 'Image'}
          className="h-auto max-h-96 max-w-full rounded outline outline-1 [outline-color:var(--chat-media-outline)]"
          onError={handleLoadError}
        />
      )}

      {messageType === 'video' && (
        <video
          src={mediaUrl}
          controls
          className="h-auto max-h-96 max-w-full rounded outline outline-1 [outline-color:var(--chat-media-outline)]"
          onError={handleLoadError}
        />
      )}

      {messageType === 'audio' && (
        <audio src={mediaUrl} controls className="w-full" onError={handleLoadError} />
      )}

      {messageType === 'document' && (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 items-center gap-2 text-sm text-primary underline transition-opacity hover:opacity-80"
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{filename || 'Download document'}</span>
        </a>
      )}
    </div>
  );
}
