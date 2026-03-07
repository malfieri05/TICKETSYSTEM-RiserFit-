'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Ticket,
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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Department } from '@/types';

const navItemsDefault = [
  { href: '/tickets', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'My Dashboard', icon: LayoutGrid },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Studio users see My Tickets → /portal instead of Home + My Dashboard. */
const navItemsStudioUser = [
  { href: '/portal', label: 'My Tickets', icon: Home },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

/** Shown when user can have READY subtasks (department or admin). */
const actionableNavItem = { href: '/inbox', label: 'Actionable', icon: Inbox };

const adminItems = [
  { href: '/admin/categories', label: 'Categories', icon: LayoutDashboard },
  { href: '/admin/markets', label: 'Markets & Studios', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Settings },
  { href: '/admin/workflow-templates', label: 'Workflow Templates', icon: LayoutDashboard },
  { href: '/admin/workflow-analytics', label: 'Workflow Analytics', icon: BarChart2 },
  { href: '/admin/reporting', label: 'Reporting', icon: BarChart2 },
  { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
];

const BG     = '#111111';
const BORDER = '#2a2a2a';
const ACTIVE = '#222222';
const HOVER  = '#1a1a1a';
const ACCENT = '#14b8a6';

/** Map department enum to display label. Never show raw "DEPARTMENT_USER". */
function departmentToLabel(d?: Department): string {
  if (d === 'HR') return 'HR';
  if (d === 'OPERATIONS') return 'Operations';
  if (d === 'MARKETING') return 'Marketing';
  return 'Marketing';
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
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isAdmin = user?.role === 'ADMIN';
  const isStudioUser = user?.role === 'STUDIO_USER';
  const navItems = isStudioUser ? navItemsStudioUser : navItemsDefault;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col"
      style={{ background: BG, borderRight: `1px solid ${BORDER}` }}
    >
      {/* Logo */}
      <div
        className="flex h-14 items-center gap-2.5 px-5"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500">
          <Ticket className="h-4 w-4 text-white" />
        </div>
        <span className="font-bold text-white tracking-tight">Riser Fitness</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5">

        {/* + New Ticket button — sits above Home */}
        <button
          onClick={() => router.push('/tickets/new')}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold mb-4 transition-colors"
          style={{ background: '#14b8a6', color: '#ffffff' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#0d9488')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#14b8a6')}
        >
          <Plus className="h-4 w-4 shrink-0" />
          New Ticket
        </button>

        {navItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/portal'
            ? pathname === '/portal' || pathname.startsWith('/portal/')
            : href === '/tickets'
              ? pathname === '/tickets' || (pathname.startsWith('/tickets/') && pathname !== '/tickets/new')
              : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? ACTIVE : 'transparent',
                color: active ? '#ffffff' : '#888888',
                borderLeft: `3px solid ${active ? ACCENT : 'transparent'}`,
              }}
              onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = '#cccccc'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.background = active ? ACTIVE : 'transparent'; e.currentTarget.style.color = active ? '#ffffff' : '#888888'; }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {(user?.role === 'DEPARTMENT_USER' || user?.role === 'ADMIN') && (
          <Link
            href={actionableNavItem.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: pathname === actionableNavItem.href ? ACTIVE : 'transparent',
              color: pathname === actionableNavItem.href ? '#ffffff' : '#888888',
              borderLeft: `3px solid ${pathname === actionableNavItem.href ? ACCENT : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (pathname !== actionableNavItem.href) {
                e.currentTarget.style.background = HOVER;
                e.currentTarget.style.color = '#cccccc';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = pathname === actionableNavItem.href ? ACTIVE : 'transparent';
              e.currentTarget.style.color = pathname === actionableNavItem.href ? '#ffffff' : '#888888';
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
              background: pathname === '/handbook' ? ACTIVE : 'transparent',
              color: pathname === '/handbook' ? '#ffffff' : '#888888',
              borderLeft: `3px solid ${pathname === '/handbook' ? ACCENT : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (pathname !== '/handbook') {
                e.currentTarget.style.background = HOVER;
                e.currentTarget.style.color = '#cccccc';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = pathname === '/handbook' ? ACTIVE : 'transparent';
              e.currentTarget.style.color = pathname === '/handbook' ? '#ffffff' : '#888888';
            }}
          >
            <BookMarked className="h-4 w-4 shrink-0" />
            Handbook
          </Link>
        )}

        {isAdmin && (
          <>
            <div className="pt-5 pb-1.5 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#555555' }}>
                Admin
              </p>
            </div>
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: active ? ACTIVE : 'transparent',
                    color: active ? '#ffffff' : '#888888',
                    borderLeft: `3px solid ${active ? ACCENT : 'transparent'}`,
                  }}
                  onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = HOVER; e.currentTarget.style.color = '#cccccc'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = active ? ACTIVE : 'transparent'; e.currentTarget.style.color = active ? '#ffffff' : '#888888'; }}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User footer */}
      <div style={{ borderTop: `1px solid ${BORDER}` }} className="p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white text-sm font-semibold shrink-0">
            {user?.displayName?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.displayName}</p>
            <p className="truncate text-[11px]" style={{ color: '#888888' }}>
              {userRoleDisplayLabel(user?.role, user?.departments)}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="transition-colors"
            style={{ color: '#555555' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#cccccc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
