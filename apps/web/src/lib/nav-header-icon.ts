import type { LucideIcon } from 'lucide-react';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import {
  Activity,
  Bell,
  BookMarked,
  BookOpen,
  Bot,
  Building2,
  Home,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  MapPin,
  Plus,
  User,
  Truck,
  Workflow,
} from 'lucide-react';

/**
 * Icon for the app header, aligned with {@link Sidebar} nav items for the current route.
 */
export function getNavHeaderIcon(
  pathname: string,
  searchParams: ReadonlyURLSearchParams,
): LucideIcon | null {
  // —— Portal (studio users): tab-specific ——————————————————————
  if (pathname === '/portal') {
    const tab = searchParams.get('tab') ?? 'my';
    if (tab === 'dashboard') return LayoutDashboard;
    if (tab === 'studio') return Building2;
    return Home;
  }

  if (pathname.startsWith('/portal/tickets')) {
    return Home;
  }

  // —— Admin (prefix order: longest / most specific first) ———————
  if (pathname.startsWith('/admin/email-automation')) return Mail;
  if (pathname.startsWith('/admin/dispatch')) return Truck;
  if (pathname.startsWith('/admin/lease-iq')) return BookMarked;
  if (pathname.startsWith('/admin/workflow-templates')) return Workflow;
  if (pathname.startsWith('/admin/markets')) return MapPin;
  if (pathname.startsWith('/admin/knowledge-base')) return BookOpen;
  if (pathname.startsWith('/admin/users')) return User;
  if (pathname.startsWith('/admin/system-monitoring')) return Activity;

  // —— Tickets ————————————————————————————————————————————————
  if (pathname === '/tickets/new') return Plus;
  if (pathname.startsWith('/tickets/')) return Home;
  if (pathname === '/tickets') return Home;

  // —— Core —————————————————————————————————————————————————————
  if (pathname === '/dashboard') return LayoutGrid;
  if (pathname.startsWith('/notifications')) return Bell;
  if (pathname === '/inbox') return Inbox;
  if (pathname.startsWith('/assistant')) return Bot;

  if (pathname.startsWith('/locations/')) return MapPin;

  return null;
}
