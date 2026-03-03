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
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/tickets', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'My Dashboard', icon: LayoutGrid },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const adminItems = [
  { href: '/admin/categories', label: 'Categories', icon: LayoutDashboard },
  { href: '/admin/markets', label: 'Markets & Studios', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Settings },
  { href: '/admin/reporting', label: 'Reporting', icon: BarChart2 },
  { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
];

const BG     = '#111111';
const BORDER = '#2a2a2a';
const ACTIVE = '#222222';
const HOVER  = '#1a1a1a';
const ACCENT = '#14b8a6';

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const isAdmin = user?.role === 'ADMIN';

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
          const active = href === '/tickets'
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
              {user?.role}
            </p>
            {user?.teamName && (
              <p className="truncate text-[11px]" style={{ color: '#666666' }}>
                Department: {user.teamName}
              </p>
            )}
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
