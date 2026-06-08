'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Check,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Smartphone
} from 'lucide-react';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/inbox-data';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import type { InboxSettingsResponse, KapsoPhoneNumber } from '@/types/settings';

const SETTINGS_QUERY_KEY = ['inbox-settings'] as const;

async function fetchInboxSettings(refresh = false): Promise<InboxSettingsResponse> {
  const response = await fetch(`/api/settings${refresh ? '?refresh=true' : ''}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load settings');
  }

  return data;
}

function displayNameForPhoneNumber(phoneNumber: KapsoPhoneNumber): string {
  return (
    phoneNumber.display_name ||
    phoneNumber.verified_name ||
    phoneNumber.name ||
    phoneNumber.display_phone_number ||
    phoneNumber.phone_number_id
  );
}

function groupPhoneNumbersByWaba(phoneNumbers: KapsoPhoneNumber[]) {
  const groups = new Map<string, KapsoPhoneNumber[]>();

  phoneNumbers.forEach((phoneNumber) => {
    const key = phoneNumber.business_account_id || 'Unassigned WABA';
    const existing = groups.get(key) ?? [];
    existing.push(phoneNumber);
    groups.set(key, existing);
  });

  return Array.from(groups.entries()).map(([businessAccountId, numbers]) => ({
    businessAccountId,
    numbers
  }));
}

function qualityClass(qualityRating?: string) {
  switch (qualityRating) {
    case 'GREEN':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'YELLOW':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'RED':
      return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
    default:
      return 'border-[var(--chat-border-strong)] bg-[var(--chat-hover)] text-muted-foreground';
  }
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [selectedPhoneNumberIds, setSelectedPhoneNumberIds] = useState<string[]>([]);
  const [defaultPhoneNumberId, setDefaultPhoneNumberId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    data,
    error,
    isPending,
    isFetching
  } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => fetchInboxSettings(false),
  });

  useEffect(() => {
    if (!data || dirty) return;

    setSelectedPhoneNumberIds(data.selectedPhoneNumberIds);
    setDefaultPhoneNumberId(data.defaultPhoneNumberId);
  }, [data, dirty]);

  const groups = useMemo(
    () => groupPhoneNumbersByWaba(data?.phoneNumbers ?? []),
    [data?.phoneNumbers],
  );

  const selectedIdSet = useMemo(
    () => new Set(selectedPhoneNumberIds),
    [selectedPhoneNumberIds],
  );

  const selectedCount = selectedPhoneNumberIds.length;

  const handleTogglePhoneNumber = (phoneNumberId: string) => {
    setSaveMessage(null);
    setSaveError(null);
    setDirty(true);

    setSelectedPhoneNumberIds((currentIds) => {
      const isSelected = currentIds.includes(phoneNumberId);
      const nextIds = isSelected
        ? currentIds.filter(id => id !== phoneNumberId)
        : [...currentIds, phoneNumberId];

      setDefaultPhoneNumberId((currentDefaultId) => {
        if (!nextIds.length) return undefined;
        if (!currentDefaultId || currentDefaultId === phoneNumberId && isSelected) {
          return nextIds[0];
        }
        return currentDefaultId;
      });

      return nextIds;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selectedPhoneNumberIds,
          defaultPhoneNumberId
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save settings');
      }

      queryClient.setQueryData(SETTINGS_QUERY_KEY, payload);
      await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
      setDirty(false);
      setSaveMessage('Saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setSaveMessage(null);
    setSaveError(null);

    try {
      const refreshedSettings = await fetchInboxSettings(true);
      queryClient.setQueryData(SETTINGS_QUERY_KEY, refreshedSettings);
      setSelectedPhoneNumberIds(refreshedSettings.selectedPhoneNumberIds);
      setDefaultPhoneNumberId(refreshedSettings.defaultPhoneNumberId);
      setDirty(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to refresh numbers');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-dvh min-h-dvh overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] px-4 py-3 safe-area-top">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="size-10 flex-shrink-0 rounded-md text-muted-foreground hover:bg-[var(--chat-hover)]"
              aria-label="Back to inbox"
              title="Back to inbox"
            >
              <Link href="/">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <Settings className="size-4 flex-shrink-0 text-[var(--chat-presence)]" />
              <h1 className="truncate text-base font-semibold">Inbox settings</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="size-10 rounded-md text-muted-foreground" />
            <Button
              type="button"
              variant="outline"
              onClick={handleRefresh}
              disabled={refreshing || saving}
              className="h-10 rounded-md"
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving || refreshing}
              className="h-10 rounded-md bg-primary hover:bg-[var(--primary-hover)]"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              <span>Save</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5">
        <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Tracked numbers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedCount} selected
              {data?.phoneNumbers.length ? ` of ${data.phoneNumbers.length}` : ''}
            </p>
          </div>
          <div className="flex min-h-6 items-center gap-2 text-sm">
            {isFetching && !refreshing && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Syncing
              </span>
            )}
            {saveMessage && (
              <span className="inline-flex items-center gap-1.5 text-[var(--chat-presence)]">
                <Check className="size-3.5" />
                {saveMessage}
              </span>
            )}
          </div>
        </section>

        {saveError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {saveError}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load settings'}
          </div>
        )}

        {isPending ? (
          <div className="flex h-60 items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-md border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-4 py-8 text-center text-sm text-muted-foreground">
            No WhatsApp numbers found.
          </div>
        ) : (
          <div className="space-y-6 pb-8">
            {groups.map((group) => (
              <section key={group.businessAccountId} className="space-y-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 flex-shrink-0 text-muted-foreground" />
                  <h3 className="truncate text-sm font-semibold">
                    {group.businessAccountId}
                  </h3>
                  <Badge variant="outline" className="rounded-md">
                    {group.numbers.length}
                  </Badge>
                </div>

                <div className="grid gap-2">
                  {group.numbers.map((phoneNumber) => {
                    const phoneNumberId = phoneNumber.phone_number_id;
                    const selected = selectedIdSet.has(phoneNumberId);
                    const isDefault = defaultPhoneNumberId === phoneNumberId;

                    return (
                      <div
                        key={phoneNumberId}
                        className={cn(
                          'grid gap-3 rounded-md border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] p-3 transition-colors sm:grid-cols-[minmax(0,1fr)_auto]',
                          selected && 'border-primary/50 bg-primary/5'
                        )}
                      >
                        <label className="flex min-w-0 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleTogglePhoneNumber(phoneNumberId)}
                            className="mt-1 size-4 rounded border-[var(--chat-border-strong)] accent-primary"
                            aria-label={`Track ${displayNameForPhoneNumber(phoneNumber)}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold">
                                {displayNameForPhoneNumber(phoneNumber)}
                              </span>
                              {phoneNumber.status && (
                                <Badge variant="outline" className="rounded-md">
                                  {phoneNumber.status}
                                </Badge>
                              )}
                              {phoneNumber.quality_rating && (
                                <Badge variant="outline" className={cn('rounded-md', qualityClass(phoneNumber.quality_rating))}>
                                  {phoneNumber.quality_rating}
                                </Badge>
                              )}
                            </span>
                            <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Smartphone className="size-3.5" />
                                {phoneNumber.display_phone_number || phoneNumberId}
                              </span>
                              <span className="font-mono">{phoneNumberId}</span>
                              {phoneNumber.inbound_processing_enabled === false && (
                                <span>Inbound off</span>
                              )}
                            </span>
                          </span>
                        </label>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                          <label
                            className={cn(
                              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[var(--chat-border-strong)] px-3 text-xs font-medium text-muted-foreground',
                              selected && 'text-foreground',
                              isDefault && 'border-primary/50 bg-primary/10 text-foreground',
                              !selected && 'cursor-not-allowed opacity-50'
                            )}
                          >
                            <input
                              type="radio"
                              name="defaultPhoneNumberId"
                              checked={isDefault}
                              disabled={!selected}
                              onChange={() => {
                                setDirty(true);
                                setSaveMessage(null);
                                setSaveError(null);
                                setDefaultPhoneNumberId(phoneNumberId);
                              }}
                              className="size-3.5 accent-primary"
                              aria-label={`Use ${displayNameForPhoneNumber(phoneNumber)} as default sender`}
                            />
                            Default
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
