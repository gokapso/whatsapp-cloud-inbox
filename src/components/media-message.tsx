'use client';

import { useEffect, useState, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  mediaId: string;
  messageType: string;
  caption?: string | null;
  filename?: string | null;
  isOutbound?: boolean;
};

export function MediaMessage({ mediaId, messageType, caption, filename, isOutbound }: Props) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const handleLoadError = useCallback(() => {
    setLoadFailed(true);
  }, []);

  useEffect(() => {
    // Set the media URL to point to our proxy endpoint
    setMediaUrl(`/api/media/${mediaId}`);
    setLoading(false);
    setLoadFailed(false);
  }, [mediaId]);

  if (loading) {
    return (
      <div className="w-64 h-48 rounded flex items-center justify-center">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (loadFailed || !mediaUrl) {
    return (
      <div className="w-64 h-48 bg-muted rounded flex items-center justify-center">
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
          className="rounded max-w-full h-auto max-h-96"
          onError={handleLoadError}
        />
      )}

      {messageType === 'video' && (
        <video
          src={mediaUrl}
          controls
          className="rounded max-w-full h-auto max-h-96"
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
          className="flex items-center gap-2 text-sm underline cursor-pointer hover:opacity-80 transition-opacity text-[#00a884]"
        >
          <FileText className="h-4 w-4" />
          {filename || 'Download document'}
        </a>
      )}
    </div>
  );
}
