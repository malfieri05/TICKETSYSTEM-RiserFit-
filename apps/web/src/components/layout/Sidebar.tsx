'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Bell,
  Settings,
  LogOut,
  BarChart2,
  BookOpen,
  Home,
  Plus,
  LayoutGrid,
  BookMarked,
  Inbox,
  Sun,
  Moon,
  Activity,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationCount } from '@/hooks/useNotifications';
import type { Department } from '@/types';

type PortalTab = 'my' | 'studio' | 'dashboard';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Optional tab for /portal routing (Studio users). */
  tab?: PortalTab;
};

const navItemsDefault: NavItem[] = [
  { href: '/tickets', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Studio users: My Tickets / By Studio(s) / Dashboard in sidebar, all under /portal. */
const navItemsStudioUser: NavItem[] = [
  { href: '/portal', label: 'My Tickets', icon: Home, tab: 'my' },
  { href: '/portal', label: 'By Studio(s)', icon: LayoutGrid, tab: 'studio' },
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Department users land on Inbox (actionable queue + topics). */
const navItemsDepartmentUser: NavItem[] = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/tickets', label: 'Tickets', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Shown when user can have READY subtasks (admin). */
const actionableNavItem = { href: '/inbox', label: 'Actionable', icon: Inbox };

/** Admin nav grouped for clarity. */
const adminGroups: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: 'Configuration',
    items: [
      { href: '/admin/markets', label: 'Locations', icon: LayoutDashboard },
      { href: '/admin/users', label: 'Users', icon: Settings },
    ],
  },
  {
    label: 'Workflows',
    items: [
      { href: '/admin/workflow-templates', label: 'Workflow Templates', icon: LayoutDashboard },
      { href: '/admin/workflow-analytics', label: 'Workflow Analytics', icon: BarChart2 },
    ],
  },
  {
    label: 'Reporting & Dispatch',
    items: [
      { href: '/admin/reporting', label: 'Reporting', icon: BarChart2 },
      { href: '/admin/dispatch', label: 'Vendor Dispatch', icon: BarChart2 },
    ],
  },
  {
    label: 'Content / Tools',
    items: [
      { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
      { href: '/assistant', label: 'Assistant', icon: BookOpen },
      { href: '/admin/system-monitoring', label: 'System Monitoring', icon: Activity },
    ],
  },
];

const THEME_STORAGE_KEY = 'theme';

/** Map department enum to display label. Never show raw "DEPARTMENT_USER". */
function departmentToLabel(d?: Department): string {
  if (d === 'HR') return 'HR';
  if (d === 'OPERATIONS') return 'Operations';
  if (d === 'MARKETING') return 'Marketing';
  return 'Unassigned Department';
}

/** Single line under user name: Admin | Studio User | department name (never raw enum). */
function userRoleDisplayLabel(role: string | undefined, departments?: Department[]): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'STUDIO_USER') return 'Studio User';
  if (role === 'DEPARTMENT_USER') return departmentToLabel(departments?.[0]);
  return 'User';
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const router = useRouter();
  const { unreadCount } = useNotificationCount();

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') setTheme(t);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isStudioUser = user?.role === 'STUDIO_USER';
  const isDepartmentUser = user?.role === 'DEPARTMENT_USER';
  const navItems = isStudioUser
    ? navItemsStudioUser
    : isDepartmentUser
      ? navItemsDepartmentUser
      : navItemsDefault;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col"
      style={{ background: 'var(--color-bg-surface)', borderRight: '1px solid var(--color-border-default)' }}
    >
      {/* Logo */}
      <div
        className="flex h-14 items-center gap-2.5 px-5"
        style={{ borderBottom: '1px solid var(--color-border-default)' }}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden bg-transparent">
          <img
            src="/Logo.png"
            alt="Riser Fitness"
            className="h-full w-full object-contain"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <span className="font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>Riser Fitness</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5">

        {/* + New Ticket button — sits above Home */}
        <button
          onClick={() => router.push('/tickets/new')}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold mb-4 transition-colors"
          style={{ background: 'var(--color-accent)', color: '#ffffff' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus className="h-4 w-4 shrink-0" />
          New Ticket
        </button>

        {navItems.map((item) => {
          const { href, label, icon: Icon, tab } = item;
          const isPortal = href === '/portal';
          const currentTab = (searchParams.get('tab') as PortalTab | null) ?? 'my';
          const active = isPortal
            ? pathname === '/portal' && (tab ?? 'my') === currentTab
            : href === '/tickets'
              ? pathname === '/tickets' ||
                (pathname.startsWith('/tickets/') && pathname !== '/tickets/new')
              : pathname === href || pathname.startsWith(href + '/');
          const displayLabel =
            label === 'Notifications'
              ? `Notifications (${unreadCount ?? 0})`
              : label;
          return (
            <Link
              key={`${href}-${label}`}
              href={tab ? { pathname: '/portal', query: { tab } } : href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? 'var(--color-bg-surface-raised)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderLeft: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--color-bg-surface-raised)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--color-bg-surface-raised)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-muted)'; }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {displayLabel}
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href={actionableNavItem.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: pathname === actionableNavItem.href ? 'var(--color-bg-surface-raised)' : 'transparent',
              color: pathname === actionableNavItem.href ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderLeft: `3px solid ${pathname === actionableNavItem.href ? 'var(--color-accent)' : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (pathname !== actionableNavItem.href) {
                e.currentTarget.style.background = 'var(--color-bg-surface-raised)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = pathname === actionableNavItem.href ? 'var(--color-bg-surface-raised)' : 'transparent';
              e.currentTarget.style.color = pathname === actionableNavItem.href ? 'var(--color-text-primary)' : 'var(--color-text-muted)';
            }}
          >
            <actionableNavItem.icon className="h-4 w-4 shrink-0" />
            {actionableNavItem.label}
          </Link>
        )}

        {user?.studioId && (
          <Link
            href="/handbook"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: pathname === '/handbook' ? 'var(--color-bg-surface-raised)' : 'transparent',
              color: pathname === '/handbook' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              borderLeft: `3px solid ${pathname === '/handbook' ? 'var(--color-accent)' : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (pathname !== '/handbook') {
                e.currentTarget.style.background = 'var(--color-bg-surface-raised)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = pathname === '/handbook' ? 'var(--color-bg-surface-raised)' : 'transparent';
              e.currentTarget.style.color = pathname === '/handbook' ? 'var(--color-text-primary)' : 'var(--color-text-muted)';
            }}
          >
            <BookMarked className="h-4 w-4 shrink-0" />
            Handbook
          </Link>
        )}

        {isAdmin && (
          <>
            <div className="pt-5 pb-1.5 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                Admin
              </p>
            </div>
            {adminGroups.map((group) => (
              <div key={group.label}>
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                    {group.label}
                  </p>
                </div>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href) || (href === '/assistant' && pathname === '/assistant');
                  return (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: active ? 'var(--color-bg-surface-raised)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        borderLeft: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
                      }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--color-bg-surface-raised)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = active ? 'var(--color-bg-surface-raised)' : 'transparent'; e.currentTarget.style.color = active ? 'var(--color-text-primary)' : 'var(--color-text-muted)'; }}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </nav>

      {/* User footer — theme toggle + user + logout */}
      <div style={{ borderTop: '1px solid var(--color-border-default)' }} className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-raised)]"
            style={{ color: 'var(--color-text-muted)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full text-white text-sm font-semibold shrink-0" style={{ background: 'var(--color-accent)' }}>
            {user?.displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{user?.displayName}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              {userRoleDisplayLabel(user?.role, user?.departments)}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="transition-colors"
            style={{ color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
