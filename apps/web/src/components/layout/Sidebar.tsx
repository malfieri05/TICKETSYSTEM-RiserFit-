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
  ChevronRight,
  Mail,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationCount } from '@/hooks/useNotifications';
import { useNotificationsPanel } from '@/contexts/NotificationsPanelContext';
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

/** Studio users: Home = main ticket feed (portal my), then Dashboard, Notifications. */
const navItemsStudioUser: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home, tab: 'my' },
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Department users: Home = main ticket feed, then Dashboard, Notifications. */
const navItemsDepartmentUser: NavItem[] = [
  { href: '/tickets', label: 'Home', icon: Home },
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
      { href: '/admin/email-automation', label: 'Email Automation', icon: Mail },
      { href: '/admin/lease-iq', label: 'Lease IQ', icon: BookMarked },
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
  const { isOpen: isNotificationsPanelOpen, open: openNotificationsPanel, close: closeNotificationsPanel } = useNotificationsPanel();

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
      className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col"
      style={{
        background: 'var(--sidebar-glass-bg)',
        borderRight: '1px solid var(--sidebar-glass-border)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
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
        <span className="font-bold tracking-tight" style={{ color: 'var(--sidebar-text)' }}>Riser Fitness</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5">

        {/* + New Ticket button — sits above Home */}
        <button
          onClick={() => router.push('/tickets/new')}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold mb-4 transition-colors hover:opacity-90"
          style={{ background: 'var(--color-accent)', color: '#ffffff' }}
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
          if (label === 'Notifications') {
            return (
              <button
                key={`${href}-${label}`}
                type="button"
                onClick={() => isNotificationsPanelOpen ? closeNotificationsPanel() : openNotificationsPanel()}
                className="sidebar-nav-item flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium text-left"
                style={{
                  background: 'transparent',
                  color: 'var(--sidebar-text)',
                  borderLeft: '3px solid transparent',
                }}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="h-4 w-4 shrink-0" />
                  {displayLabel}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 ml-auto transition-transform duration-200 ease-out"
                  style={{ color: 'var(--sidebar-text)', transform: isNotificationsPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
            );
          }
          return (
            <Link
              key={`${href}-${label}`}
              href={tab ? { pathname: '/portal', query: { tab } } : href}
              data-active={active ? 'true' : undefined}
              className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
              style={{
                background: active ? 'var(--sidebar-nav-active-bg)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
                borderLeft: `4px solid ${active ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {displayLabel}
            </Link>
          );
        })}

        {isAdmin && (
          <Link
            href={actionableNavItem.href}
            data-active={pathname === actionableNavItem.href ? 'true' : undefined}
            className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: pathname === actionableNavItem.href ? 'var(--sidebar-nav-active-bg)' : 'transparent',
              color: pathname === actionableNavItem.href ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
              borderLeft: `4px solid ${pathname === actionableNavItem.href ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
            }}
          >
            <actionableNavItem.icon className="h-4 w-4 shrink-0" />
            {actionableNavItem.label}
          </Link>
        )}

        {isAdmin && (
          <Link
            href="/assistant"
            data-active={pathname === '/assistant' ? 'true' : undefined}
            className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: pathname === '/assistant' ? 'var(--sidebar-nav-active-bg)' : 'transparent',
              color: pathname === '/assistant' ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
              borderLeft: `4px solid ${pathname === '/assistant' ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
            }}
          >
            <Bot className="h-4 w-4 shrink-0" />
            AI Assistant
          </Link>
        )}

        {user?.studioId && (
          <Link
            href="/handbook"
            data-active={pathname === '/handbook' ? 'true' : undefined}
            className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: pathname === '/handbook' ? 'var(--sidebar-nav-active-bg)' : 'transparent',
              color: pathname === '/handbook' ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
              borderLeft: `4px solid ${pathname === '/handbook' ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
            }}
          >
            <BookMarked className="h-4 w-4 shrink-0" />
            Handbook
          </Link>
        )}

        {isAdmin && (
          <>
            <div className="pt-5 pb-1.5 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-text-secondary)' }}>
                Admin
              </p>
            </div>
            {adminGroups.map((group) => (
              <div key={group.label}>
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--sidebar-text-secondary)' }}>
                    {group.label}
                  </p>
                </div>
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      data-active={active ? 'true' : undefined}
                      className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
                      style={{
                        background: active ? 'var(--sidebar-nav-active-bg)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
                        borderLeft: `4px solid ${active ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
                      }}
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

        {/* AI Assistant — last nav item for non-admin users (admins see it below Actionable) */}
        {!isAdmin && (
          <Link
            href="/assistant"
            data-active={pathname === '/assistant' ? 'true' : undefined}
            className="sidebar-nav-item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium"
            style={{
              background: pathname === '/assistant' ? 'var(--sidebar-nav-active-bg)' : 'transparent',
              color: pathname === '/assistant' ? 'var(--color-text-primary)' : 'var(--sidebar-text)',
              borderLeft: `4px solid ${pathname === '/assistant' ? 'var(--sidebar-nav-active-border)' : 'transparent'}`,
            }}
          >
            <Bot className="h-4 w-4 shrink-0" />
            AI Assistant
          </Link>
        )}
      </nav>

      {/* User footer — theme toggle + user + logout */}
      <div style={{ borderTop: '1px solid var(--color-border-default)' }} className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--color-bg-surface-raised)]"
            style={{ color: 'var(--sidebar-text)' }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold shrink-0" style={{ background: 'var(--color-accent)', color: '#ffffff' }}>
            {user?.displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: 'var(--sidebar-text)' }}>{user?.displayName}</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--sidebar-text-secondary)' }}>
              {userRoleDisplayLabel(user?.role, user?.departments)}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="transition-colors hover:opacity-80"
            style={{ color: 'var(--sidebar-text)' }}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
