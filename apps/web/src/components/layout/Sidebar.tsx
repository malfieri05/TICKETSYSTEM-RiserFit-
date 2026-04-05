'use client';

import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Bell,
  Settings,
  BarChart2,
  BookOpen,
  Home,
  Plus,
  LayoutGrid,
  BookMarked,
  Inbox,
  Activity,
  ChevronRight,
  ChevronDown,
  Mail,
  Bot,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationCount } from '@/hooks/useNotifications';
import { useNotificationsPanel } from '@/contexts/NotificationsPanelContext';
import {
  useSidebarCollapse,
  SIDEBAR_EXPANDED_WIDTH_PX,
  SIDEBAR_COLLAPSED_WIDTH_PX,
} from '@/contexts/SidebarCollapseContext';
import { BrandMark } from '@/components/layout/BrandMark';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';
import { cn } from '@/lib/utils';

/** Must match SIDEBAR_RAIL_TRANSITION_* in SidebarCollapseContext (Tailwind needs literal class names). */
const RAIL_DURATION_CLASS = 'duration-[700ms]';
const RAIL_EASE_CLASS = 'ease-[cubic-bezier(0.4,0,0.2,1)]';

const railToggleBtnClass = cn(
  'focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
  'border border-transparent bg-transparent text-[var(--sidebar-text-secondary)]',
  'transition-[background-color,border-color] duration-150 motion-reduce:transition-none',
  'hover:bg-[color-mix(in_srgb,var(--sidebar-text)_10%,transparent)]',
  'hover:border-[color-mix(in_srgb,var(--sidebar-glass-border)_80%,transparent)]',
);

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

const navItemsStudioUser: NavItem[] = [
  { href: '/portal', label: 'Home', icon: Home, tab: 'my' },
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard, tab: 'dashboard' },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const navItemsDepartmentUser: NavItem[] = [
  { href: '/tickets', label: 'Home', icon: Home },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/notifications', label: 'Notifications', icon: Bell },
];

const actionableNavItem = { href: '/inbox', label: 'Actionable', icon: Inbox };

const adminGroups: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: 'Content / Tools:',
    items: [
      { href: '/admin/lease-iq', label: 'Lease IQ', icon: BookMarked },
      { href: '/admin/dispatch', label: 'Vendor Dispatch', icon: Truck },
      { href: '/admin/email-automation', label: 'Email Automation', icon: Mail },
    ],
  },
  {
    label: 'Workflows:',
    items: [
      { href: '/admin/workflow-templates', label: 'Workflow Templates', icon: LayoutDashboard },
      { href: '/admin/workflow-analytics', label: 'Workflow Analytics', icon: BarChart2 },
    ],
  },
  {
    label: 'Configuration:',
    items: [
      { href: '/admin/markets', label: 'Locations', icon: LayoutDashboard },
      { href: '/admin/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
      { href: '/admin/users', label: 'Users', icon: Settings },
      { href: '/admin/system-monitoring', label: 'System Monitoring', icon: Activity },
    ],
  },
];

/** Rounded panel + vertical rail (no chevron) — matches ChatGPT-style toggle. */
function SidebarFoldGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <line x1="9.5" y1="4" x2="9.5" y2="20" />
    </svg>
  );
}

/** Text column — clipped by the animating shell (ChatGPT-style); icons stay left. */
function SidebarLabel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={cn('min-w-0 flex-1 truncate text-left', className)} style={style}>
      {children}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const { unreadCount } = useNotificationCount();
  const { isOpen: isNotificationsPanelOpen, open: openNotificationsPanel, close: closeNotificationsPanel } =
    useNotificationsPanel();
  const { collapsed, toggle, setCollapsed } = useSidebarCollapse();

  const onCollapsedRailActivate = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      if (!collapsed) return;
      const t = e.target as HTMLElement;
      if (t.closest('a[href], button')) return;
      setCollapsed(false);
    },
    [collapsed, setCollapsed],
  );

  const [adminNavExpanded, setAdminNavExpanded] = useState(true);

  useLayoutEffect(() => {
    if (collapsed) {
      setAdminNavExpanded(false);
    }
  }, [collapsed]);

  const isAdmin = user?.role === 'ADMIN';
  const isStudioUser = user?.role === 'STUDIO_USER';
  const isDepartmentUser = user?.role === 'DEPARTMENT_USER';
  const navItems = isStudioUser ? navItemsStudioUser : isDepartmentUser ? navItemsDepartmentUser : navItemsDefault;

  const railW = collapsed ? SIDEBAR_COLLAPSED_WIDTH_PX : SIDEBAR_EXPANDED_WIDTH_PX;

  /** Expanded: full rows. Collapsed: icon-only tiles aligned for a 64px clip (no partial label bleed). */
  const linkBase = (active: boolean) =>
    collapsed
      ? cn(
          'sidebar-nav-item flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-0 p-0 text-sm font-medium',
          'transition-colors duration-150 motion-reduce:transition-none',
          active
            ? 'bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-text-active)]'
            : 'bg-transparent text-[var(--sidebar-text)]',
        )
      : cn(
          'sidebar-nav-item flex w-full min-w-0 items-center gap-3 rounded-lg border-l-4 px-3 py-2 text-sm font-medium',
          'transition-colors duration-150 motion-reduce:transition-none',
          active
            ? 'border-[var(--sidebar-nav-active-border)] bg-[var(--sidebar-nav-active-bg)] text-[var(--sidebar-text-active)]'
            : 'border-transparent bg-transparent text-[var(--sidebar-text)]',
        );

  const innerStyle: CSSProperties = {
    width: SIDEBAR_EXPANDED_WIDTH_PX,
    minWidth: SIDEBAR_EXPANDED_WIDTH_PX,
  };

  return (
    <aside
      aria-label="Sidebar"
      onClick={onCollapsedRailActivate}
      className={cn(
        'layout-sidebar fixed inset-y-0 left-0 z-[100] flex flex-col overflow-hidden',
        'transition-[width]',
        RAIL_DURATION_CLASS,
        RAIL_EASE_CLASS,
        'motion-reduce:transition-none',
        collapsed && 'cursor-pointer',
      )}
      style={{
        width: railW,
        background: 'var(--sidebar-glass-bg)',
        borderRight: '1px solid var(--sidebar-glass-border)',
        boxShadow: 'var(--shadow-sidebar-rail)',
      }}
    >
      {/* Fixed expanded-width column: shell clips horizontally so labels shear like ChatGPT. */}
      <div className="flex h-full min-h-0 flex-col" style={innerStyle}>
        <div
          className={cn(
            'flex h-[4.75rem] shrink-0 items-center border-b',
            collapsed ? 'justify-start pl-3 pr-2' : 'gap-3 px-6',
          )}
          style={{ borderColor: 'var(--sidebar-divider)' }}
        >
          <BrandMark size="sm" />
          {!collapsed ? (
            <SidebarLabel
              className="text-[1.4rem] font-bold leading-tight tracking-tight"
              style={{ color: 'var(--sidebar-text-active)' }}
            >
              Riser Fitness
            </SidebarLabel>
          ) : null}
        </div>

        <nav
          className={cn(
            'min-h-0 flex-1 space-y-0.5 overflow-y-auto py-4',
            collapsed ? 'px-0 pl-3 pr-1' : 'px-2.5',
          )}
        >
          <button
            type="button"
            onClick={() => router.push('/tickets/new')}
            className={cn(
              'mb-4 flex shrink-0 items-center justify-center rounded-lg font-semibold transition-opacity duration-150 hover:opacity-90 motion-reduce:transition-none',
              collapsed ? 'size-10 p-0' : 'w-full min-w-0 gap-3 px-3 py-2 text-left text-sm',
            )}
            style={{ background: 'var(--color-accent)', color: '#ffffff' }}
            aria-label="New Ticket"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed ? <SidebarLabel>New Ticket</SidebarLabel> : null}
          </button>

          {navItems.map((item) => {
            const { href, label, icon: Icon, tab } = item;
            const isPortal = href === '/portal';
            const currentTab = (searchParams.get('tab') as PortalTab | null) ?? 'my';
            const active = isPortal
              ? pathname === '/portal' && (tab ?? 'my') === currentTab
              : href === '/tickets'
                ? pathname === '/tickets' || (pathname.startsWith('/tickets/') && pathname !== '/tickets/new')
                : pathname === href || pathname.startsWith(href + '/');
            const displayLabel =
              label === 'Notifications' ? `Notifications (${unreadCount ?? 0})` : label;

            if (label === 'Notifications') {
              const notifBtn = collapsed ? (
                <button
                  type="button"
                  onClick={() => (isNotificationsPanelOpen ? closeNotificationsPanel() : openNotificationsPanel())}
                  className={linkBase(false)}
                  style={{
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                  }}
                  aria-label={displayLabel}
                >
                  <span className="relative inline-flex shrink-0">
                    <Icon className="h-4 w-4" aria-hidden />
                    {(unreadCount ?? 0) > 0 ? (
                      <span
                        className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                        style={{ background: 'var(--color-danger, #dc2626)' }}
                      >
                        {(unreadCount ?? 0) > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => (isNotificationsPanelOpen ? closeNotificationsPanel() : openNotificationsPanel())}
                  className={cn(linkBase(false), 'justify-between text-left')}
                  style={{
                    background: 'transparent',
                    color: 'var(--sidebar-text)',
                    borderLeft: '4px solid transparent',
                  }}
                  aria-label={displayLabel}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="relative inline-flex shrink-0">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <SidebarLabel>{displayLabel}</SidebarLabel>
                  </span>
                  <ChevronRight
                    className="ml-1 h-4 w-4 shrink-0 transition-transform duration-200 ease-out"
                    style={{
                      color: 'var(--sidebar-text-secondary)',
                      transform: isNotificationsPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                    aria-hidden
                  />
                </button>
              );
              if (collapsed) {
                return (
                  <InstantTooltip
                    key={`${href}-${label}`}
                    content={displayLabel}
                    compact
                    placement="above"
                    preventPlacementFlip
                    className="block min-w-0"
                  >
                    {notifBtn}
                  </InstantTooltip>
                );
              }
              return <Fragment key={`${href}-${label}`}>{notifBtn}</Fragment>;
            }

            const linkInner = (
              <Link
                href={tab ? { pathname: '/portal', query: { tab } } : href}
                data-active={active ? 'true' : undefined}
                className={linkBase(active)}
                aria-label={displayLabel}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed ? <SidebarLabel>{displayLabel}</SidebarLabel> : null}
              </Link>
            );

            if (collapsed) {
              return (
                <InstantTooltip
                  key={`${href}-${label}`}
                  content={displayLabel}
                  compact
                  placement="above"
                  preventPlacementFlip
                  className="block min-w-0"
                >
                  {linkInner}
                </InstantTooltip>
              );
            }
            return <Fragment key={`${href}-${label}`}>{linkInner}</Fragment>;
          })}

          {isAdmin &&
            (
              [
                {
                  href: actionableNavItem.href,
                  label: actionableNavItem.label,
                  Icon: actionableNavItem.icon,
                  active: pathname === actionableNavItem.href,
                },
                {
                  href: '/assistant',
                  label: 'AI Assistant',
                  Icon: Bot,
                  active: pathname === '/assistant',
                },
              ] as const
            ).map(({ href, label, Icon, active }) => {
              const row = (
                <Link
                  href={href}
                  data-active={active ? 'true' : undefined}
                  className={linkBase(active)}
                  aria-label={label}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {!collapsed ? <SidebarLabel>{label}</SidebarLabel> : null}
                </Link>
              );
              return collapsed ? (
                <InstantTooltip
                  key={href}
                  content={label}
                  compact
                  placement="above"
                  preventPlacementFlip
                  className="block min-w-0"
                >
                  {row}
                </InstantTooltip>
              ) : (
                <Fragment key={href}>{row}</Fragment>
              );
            })}

          {user?.studioId &&
            (collapsed ? (
              <InstantTooltip content="Handbook" compact placement="above" preventPlacementFlip className="block min-w-0">
                <Link
                  href="/handbook"
                  data-active={pathname === '/handbook' ? 'true' : undefined}
                  className={linkBase(pathname === '/handbook')}
                  aria-label="Handbook"
                >
                  <BookMarked className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </InstantTooltip>
            ) : (
              <Link
                href="/handbook"
                data-active={pathname === '/handbook' ? 'true' : undefined}
                className={linkBase(pathname === '/handbook')}
                aria-label="Handbook"
              >
                <BookMarked className="h-4 w-4 shrink-0" aria-hidden />
                <SidebarLabel>Handbook</SidebarLabel>
              </Link>
            ))}

          {isAdmin && !collapsed && (
            <div
              className="mt-6 pt-4"
              style={{
                borderTop: '1px solid color-mix(in srgb, var(--sidebar-divider) 32%, transparent)',
              }}
            >
              <button
                type="button"
                id="sidebar-admin-toggle"
                aria-expanded={adminNavExpanded}
                aria-controls="sidebar-admin-section"
                onClick={() => setAdminNavExpanded((v) => !v)}
                className="focus-ring flex w-full items-center justify-start gap-[9px] rounded-lg px-3 pb-[9px] text-left"
                style={{ background: 'transparent' }}
              >
                <span
                  className="text-[15px] font-semibold uppercase leading-none tracking-widest"
                  style={{ color: 'var(--sidebar-text-secondary)' }}
                >
                  Admin
                </span>
                <span
                  className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 transition-[background-color] duration-150 hover:!bg-[var(--sidebar-nav-hover)]"
                  aria-hidden
                >
                  <ChevronDown
                    className="size-[21px] transition-transform duration-200 ease-out"
                    strokeWidth={2.5}
                    style={{
                      color: 'var(--sidebar-text-secondary)',
                      transform: adminNavExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </span>
              </button>
              <div
                id="sidebar-admin-section"
                className="grid min-h-0 transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: adminNavExpanded ? '1fr' : '0fr' }}
              >
                <div className="min-h-0 overflow-hidden" inert={!adminNavExpanded}>
                  {adminGroups.map((group) => (
                    <div key={group.label}>
                      <div className="px-3 pb-1 pt-3">
                        <p
                          className="text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color: 'var(--sidebar-text-secondary)' }}
                        >
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
                            className={linkBase(active)}
                            aria-label={label}
                          >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden />
                            <SidebarLabel>{label}</SidebarLabel>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isAdmin &&
            (collapsed ? (
              <InstantTooltip content="AI Assistant" compact placement="above" preventPlacementFlip className="block min-w-0">
                <Link
                  href="/assistant"
                  data-active={pathname === '/assistant' ? 'true' : undefined}
                  className={linkBase(pathname === '/assistant')}
                  aria-label="AI Assistant"
                >
                  <Bot className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </InstantTooltip>
            ) : (
              <Link
                href="/assistant"
                data-active={pathname === '/assistant' ? 'true' : undefined}
                className={linkBase(pathname === '/assistant')}
                aria-label="AI Assistant"
              >
                <Bot className="h-4 w-4 shrink-0" aria-hidden />
                <SidebarLabel>AI Assistant</SidebarLabel>
              </Link>
            ))}
        </nav>

        {/* Same horizontal inset in both states so the toggle does not shift when expanding/collapsing */}
        <div
          className="mt-auto flex shrink-0 justify-start border-t py-2 pl-3.5 pr-2"
          style={{ borderColor: 'var(--sidebar-divider)' }}
        >
          {collapsed ? (
            <InstantTooltip
              content="Expand sidebar"
              compact
              placement="above"
              preventPlacementFlip
              className="inline-flex shrink-0"
            >
              <button type="button" onClick={() => toggle()} className={railToggleBtnClass} aria-label="Expand sidebar">
                <SidebarFoldGlyph />
              </button>
            </InstantTooltip>
          ) : (
            <button type="button" onClick={() => toggle()} className={railToggleBtnClass} aria-label="Collapse sidebar">
              <SidebarFoldGlyph />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
