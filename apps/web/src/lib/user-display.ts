import type { Department, UserRole } from '@/types';

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
