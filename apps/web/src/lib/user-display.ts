import type { Department, UserRole } from '@/types';

/**
 * Initials from display name: "First Last" → "FL", single word → first two letters
 * (e.g. "Madison" → "MA"), empty → "?".
 */
export function getDisplayNameInitials(displayName: string | undefined): string {
  const trimmed = (displayName ?? '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0);
    const last = parts[parts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }
  const one = trimmed.slice(0, 2);
  return one.length === 1 ? one.toUpperCase() : one.toUpperCase();
}

/** Map department enum to display label. Never show raw enum strings. */
export function departmentToLabel(d?: Department): string {
  if (d === 'HR') return 'HR';
  if (d === 'OPERATIONS') return 'Operations';
  if (d === 'MARKETING') return 'Marketing';
  if (d === 'RETAIL') return 'Retail';
  return 'Unassigned Department';
}

/** Single line under user name in sidebar: Admin | Studio User | department (first). */
export function userRoleDisplayLabel(role: string | undefined, departments?: Department[]): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'STUDIO_USER') return 'Studio User';
  if (role === 'DEPARTMENT_USER') return departmentToLabel(departments?.[0]);
  return 'User';
}

/** Profile card subtext: Admin / Department: … / Studio user. */
export function profileAccountTypeLabel(role: UserRole | undefined, departments?: Department[]): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'STUDIO_USER') return 'Studio user';
  if (role === 'DEPARTMENT_USER') {
    const parts = departments?.length
      ? departments.map(departmentToLabel)
      : ['Unassigned Department'];
    return `Department: ${parts.join(', ')}`;
  }
  return 'User';
}
