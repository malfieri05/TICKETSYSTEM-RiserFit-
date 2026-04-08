'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, Sun, Moon, LogOut, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getDisplayNameInitials, profileAccountTypeLabel } from '@/lib/user-display';
import { cn } from '@/lib/utils';
import { TOOLTIP_PORTAL_Z_INDEX } from '@/lib/tooltip-layer';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

const THEME_STORAGE_KEY = 'theme';

function applyTheme(next: 'light' | 'dark') {
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, next);
  document.documentElement.setAttribute('data-theme', next);
}

/** First + last word of display name (drops middle names); single word or empty handled. */
function greetingName(displayName: string | undefined): string {
  const parts = displayName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'there';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function ProfileMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const syncThemeFromDocument = useCallback(() => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') setTheme(t);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = getZoomedRect(el);
    const vp = getZoomedViewport();
    setCoords({ top: r.bottom + 8, right: vp.width - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      const panel = document.getElementById('profile-menu-dropdown');
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (!user) return null;

  const initials = getDisplayNameInitials(user.displayName);
  const hiName = greetingName(user.displayName);
  const accountTypeLine = profileAccountTypeLabel(user.role, user.departments);

  const handleLogout = () => {
    setOpen(false);
    logout();
    router.push('/login');
  };

  const setDark = () => {
    setTheme('dark');
    applyTheme('dark');
  };

  const setLight = () => {
    setTheme('light');
    applyTheme('light');
  };

  const dropdown =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        id="profile-menu-dropdown"
        role="dialog"
        aria-label="Account menu"
        className="fixed w-[min(calc(100vw-24px),360px)] overflow-hidden rounded-[28px] border p-6 pt-5 box-border break-words"
        style={{
          top: coords.top,
          right: coords.right,
          zIndex: TOOLTIP_PORTAL_Z_INDEX,
          background: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border-default)',
          boxShadow: 'var(--shadow-raised)',
        }}
      >
        <div className="mb-5 grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-start gap-0">
          {user.role === 'ADMIN' ? (
            <div className="flex shrink-0 justify-start">
              <Link
                href="/admin/system-monitoring"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-btn-ghost-hover-bg)]"
                style={{ color: 'var(--color-accent)' }}
                aria-label="System monitoring"
                title="System monitoring"
              >
                <Activity className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="w-10 shrink-0" aria-hidden />
          )}
          <p
            className="min-w-0 px-1 text-center text-sm font-medium break-words"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {user.email}
          </p>
          <div className="flex shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1.5 transition-colors hover:bg-[var(--color-btn-ghost-hover-bg)]"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-5 flex justify-center">
          {user.avatarUrl ? (
            // Avatar URLs are API-provided; avoid next/image remotePatterns churn.
            // eslint-disable-next-line @next/next/no-img-element -- external user avatars
            <img
              src={user.avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full object-cover"
              style={{ boxShadow: '0 0 0 2px var(--profile-avatar-ring)' }}
            />
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold"
              style={{
                background: 'var(--color-accent)',
                color: '#ffffff',
                boxShadow: '0 0 0 2px var(--profile-avatar-ring)',
              }}
              aria-hidden
            >
              {initials}
            </div>
          )}
        </div>

        <div className="mb-6 text-center">
          <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Hi, {hiName}!
          </p>
          <p
            className="mt-1.5 text-xs font-medium leading-snug"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {accountTypeLine}
          </p>
        </div>

        <div
          className="mb-6 flex gap-2 rounded-full border p-1"
          style={{
            borderColor: 'var(--color-border-default)',
            background: 'var(--color-bg-surface-inset)',
          }}
        >
          <button
            type="button"
            onClick={setDark}
            className={cn(
              'flex flex-1 items-center justify-center rounded-full py-2.5 transition-colors',
              theme === 'dark'
                ? 'text-white'
                : 'hover:bg-[var(--color-btn-ghost-hover-bg)]',
            )}
            style={
              theme === 'dark'
                ? { background: 'var(--color-accent)' }
                : { color: 'var(--color-text-muted)' }
            }
            aria-pressed={theme === 'dark'}
            aria-label="Dark mode"
            title="Dark mode"
          >
            <Moon className="h-5 w-5 shrink-0" />
          </button>
          <button
            type="button"
            onClick={setLight}
            className={cn(
              'flex flex-1 items-center justify-center rounded-full py-2.5 transition-colors',
              theme === 'light'
                ? 'text-white'
                : 'hover:bg-[var(--color-btn-ghost-hover-bg)]',
            )}
            style={
              theme === 'light'
                ? { background: 'var(--color-accent)' }
                : { color: 'var(--color-text-muted)' }
            }
            aria-pressed={theme === 'light'}
            aria-label="Light mode"
            title="Light mode"
          >
            <Sun className="h-5 w-5 shrink-0" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-sm font-semibold transition-colors hover:bg-[var(--color-btn-ghost-hover-bg)]"
          style={{
            borderColor: 'var(--color-btn-secondary-border)',
            color: 'var(--color-accent)',
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) syncThemeFromDocument();
          setOpen((o) => !o);
        }}
        className="focus-ring box-border relative shrink-0 rounded-full border-2 border-white transition-opacity hover:opacity-90"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open account menu"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external user avatars
          <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
            style={{ background: 'var(--color-accent)', color: '#ffffff' }}
          >
            {initials}
          </div>
        )}
      </button>
      {dropdown}
    </>
  );
}
