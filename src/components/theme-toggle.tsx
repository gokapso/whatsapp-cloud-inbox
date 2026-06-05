'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Laptop, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type Mode = 'light' | 'dark' | 'system';
type ResolvedMode = 'light' | 'dark';

const MODE_STORAGE_KEY = 'mode';
const THEME_STORAGE_KEY = 'theme';
const LEGACY_THEME_STORAGE_KEY = 'whatsapp-cloud-inbox-theme';

const MODES = [
  { id: 'light', name: 'Light', icon: Sun },
  { id: 'dark', name: 'Dark', icon: Moon },
  { id: 'system', name: 'System', icon: Laptop },
] as const;

function isMode(value: string | null): value is Mode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getSystemMode(): ResolvedMode {
  if (typeof window === 'undefined') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredMode(): Mode {
  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (isMode(storedMode)) return storedMode;

  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacyTheme === 'kapso') return 'dark';
  if (legacyTheme === 'normal') return 'light';

  return 'dark';
}

function getForcedMode(): ResolvedMode | null {
  const forcedMode = document.documentElement.getAttribute('data-force-mode');

  return forcedMode === 'light' || forcedMode === 'dark' ? forcedMode : null;
}

function resolveMode(mode: Mode): ResolvedMode {
  const forcedMode = getForcedMode();
  if (forcedMode) return forcedMode;

  return mode === 'system' ? getSystemMode() : mode;
}

function getBackgroundColor(mode: ResolvedMode) {
  return mode === 'dark' ? 'hsl(20 14.3% 4.1%)' : 'hsl(0 0% 100%)';
}

function applyMode(mode: Mode) {
  const root = document.documentElement;
  const resolvedMode = resolveMode(mode);

  window.localStorage.setItem(THEME_STORAGE_KEY, 'default');
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);

  root.dataset.theme = 'default';
  root.dataset.mode = resolvedMode;
  root.style.colorScheme = resolvedMode;
  root.style.backgroundColor = getBackgroundColor(resolvedMode);

  if (resolvedMode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('dark');
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>('dark');
  const [isOpen, setIsOpen] = useState(false);

  const syncMode = (nextMode: Mode) => {
    const nextResolvedMode = resolveMode(nextMode);

    setMode(nextMode);
    setResolvedMode(nextResolvedMode);
    applyMode(nextMode);
  };

  useEffect(() => {
    syncMode(getStoredMode());
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleSystemChange = () => {
      if (mode === 'system') {
        syncMode('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);

    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [mode]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectMode = (nextMode: Mode) => {
    syncMode(nextMode);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        variant="ghost"
        size="icon"
        aria-label="Appearance"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={menuId}
        title="Appearance"
        className={cn(
          'relative size-11 text-muted-foreground hover:bg-[var(--chat-icon-hover)] hover:text-primary md:size-10',
          isOpen && 'bg-[var(--chat-icon-hover)] text-primary',
          className
        )}
      >
        <span className="relative flex size-5 items-center justify-center">
          <Sun
            className={cn(
              'absolute size-5 text-foreground transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
              resolvedMode === 'light' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
            )}
          />
          <Moon
            className={cn(
              'absolute size-5 text-foreground transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
              resolvedMode === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
            )}
          />
        </span>
        <span className="sr-only">Appearance</span>
      </Button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Appearance"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="space-y-3">
            <h4 className="px-1 text-sm font-medium text-foreground">Appearance</h4>
            <div className="grid grid-cols-1 gap-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const isActive = mode === item.id;

                return (
                  <Button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    variant="outline"
                    size="sm"
                    onClick={() => selectMode(item.id)}
                    className={cn(
                      'h-10 justify-start px-3 text-sm',
                      isActive && 'border-border bg-muted'
                    )}
                  >
                    <Icon
                      className={cn(
                        'mr-1 size-4',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    />
                    <span>{item.name}</span>
                    {isActive && <Check className="ml-auto size-4 text-primary" />}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
