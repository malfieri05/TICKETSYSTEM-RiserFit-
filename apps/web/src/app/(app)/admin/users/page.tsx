'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Bot, MapPin, X, Plus } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Select, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { ComboBox } from '@/components/ui/ComboBox';
import { MultiComboBox } from '@/components/ui/MultiComboBox';
import { EditPencilIcon } from '@/components/ui/EditPencilIcon';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';
import { usersApi, adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import type { UserRole, Department, User } from '@/types';

const panel = { background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' };

/** Select value for “every studio” in Manage locations (not a real studio id). */
const DEFAULT_LOCATION_ALL_VALUE = '__ALL__';
/** Visible label (native options ignore most CSS; typography in the string carries the emphasis). */
const DEFAULT_LOCATION_ALL_LABEL = '────────────  All locations  ────────────';

// Backend enum: HR | OPERATIONS | MARKETING. Display labels for dropdown.
const DEPARTMENT_OPTIONS: { value: Department; label: string }[] = [
  { value: 'HR', label: 'HR' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'RETAIL', label: 'Retail' },
];

function roleDisplayLabel(role: string, departments: Department[] | null): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'STUDIO_USER') return 'Studio User';
  if (role === 'DEPARTMENT_USER') {
    if (!departments || departments.length === 0) return 'Unassigned Department';
    const labels = departments
      .map((d) => DEPARTMENT_OPTIONS.find((o) => o.value === d)?.label ?? d)
      .join(', ');
    return `Department User (${labels})`;
  }
  return role;
}

/** Unique location count for STUDIO_USER (default + scope studios, no double-count). */
function visibilityLocationCount(u: User): number {
  const ids: string[] = [...(u.studioId ? [u.studioId] : []), ...(u.scopeStudioIds ?? [])];
  return new Set(ids).size;
}

/** Canonical email shown for the bundled AI agent row (display only; backend may use per-department inboxes). */
const AI_AGENT_DISPLAY_EMAIL = 'ai-agent@internal.demo';

/**
 * Min height for the Role column content block on the pinned AI row.
 * Table cells often ignore CSS min-height; an inner flex box reliably matches real rows
 * (muted role label + h-9 control row ± status line).
 */
const AI_AGENT_ROLE_CELL_MIN_INNER_CLASS = 'min-h-[4.75rem]';

/** Seeded department AI identities (e.g. ai-hr@internal.demo) — shown as one “AI Agent Account” row. */
function isAiDepartmentAgentUser(u: User): boolean {
  const email = (u.email ?? '').toLowerCase();
  if (!email.endsWith('@internal.demo')) return false;
  const local = email.split('@')[0] ?? '';
  return /^ai-[a-z0-9-]+$/.test(local);
}

function userMatchesTableFilters(
  u: User,
  qRaw: string,
  roleFilter: string,
  departmentFilter: string,
): boolean {
  if (roleFilter && u.role !== roleFilter) return false;
  if (roleFilter === 'DEPARTMENT_USER' && departmentFilter) {
    if (!(u.departments ?? []).includes(departmentFilter as Department)) return false;
  }
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  if (
    isAiDepartmentAgentUser(u) &&
    (q === 'ai' ||
      q.includes('agent') ||
      q.includes('robot') ||
      q.includes('automat') ||
      q.includes('internal.demo') ||
      q.includes('universal') ||
      q.includes('knowing') ||
      AI_AGENT_DISPLAY_EMAIL.toLowerCase().includes(q))
  ) {
    return true;
  }
  const name = (u.displayName ?? '').toLowerCase();
  const email = (u.email ?? '').toLowerCase();
  const roleLabel = roleDisplayLabel(u.role, u.departments ?? null).toLowerCase();
  const defaultLocation = (u.studio?.name ?? '').toLowerCase();
  const deptLabels = (u.departments ?? [])
    .map((d) => DEPARTMENT_OPTIONS.find((o) => o.value === d)?.label ?? d)
    .join(' ')
    .toLowerCase();
  return (
    name.includes(q) ||
    email.includes(q) ||
    roleLabel.includes(q) ||
    defaultLocation.includes(q) ||
    deptLabels.includes(q)
  );
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const users = data?.data ?? [];
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, Department[]>>({});
  const [editableRows, setEditableRows] = useState<Record<string, boolean>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (users.length === 0) return;
    const nextRoles: Record<string, UserRole> = {};
    const nextDepts: Record<string, Department[]> = {};
    users.forEach((u) => {
      nextRoles[u.id] = u.role;
      nextDepts[u.id] = u.departments ?? [];
    });
    setRoleDrafts(nextRoles);
    setDepartmentDrafts(nextDepts);
    setEditableRows(Object.fromEntries(users.map((u) => [u.id, false])));
    setSavingRows(Object.fromEntries(users.map((u) => [u.id, false])));
    setRowMessages({});
  }, [users]);

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => usersApi.updateRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const departmentsMut = useMutation({
    mutationFn: ({ id, departments }: { id: string; departments: Department[] }) =>
      usersApi.setDepartments(id, departments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const [locationsModalUserId, setLocationsModalUserId] = useState<string | null>(null);
  const [deactivateConfirmUserId, setDeactivateConfirmUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('STUDIO_USER');
  const [inviteDepartments, setInviteDepartments] = useState<Department[]>([]);
  const [inviteDefaultStudioId, setInviteDefaultStudioId] = useState('');
  const [inviteExtraStudioIds, setInviteExtraStudioIds] = useState<string[]>([]);
  const [inviteSubmitError, setInviteSubmitError] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const { data: inviteListData, isLoading: invitesLoading } = useQuery({
    queryKey: ['admin', 'invitations', 'PENDING'],
    queryFn: () => adminApi.invitations.list({ status: 'PENDING', take: 100 }),
    enabled: true,
  });
  const pendingInvites = inviteListData?.data?.data ?? [];

  const { data: inviteStudiosRes } = useQuery({
    queryKey: ['admin', 'studios'],
    queryFn: () => adminApi.listStudios(),
    enabled: addUserModalOpen,
  });
  const inviteStudios: { id: string; name: string }[] = inviteStudiosRes?.data ?? [];

  const openInviteModal = () => {
    setAddUserModalOpen(true);
    setInviteEmail('');
    setInviteName('');
    setInviteRole('STUDIO_USER');
    setInviteDepartments([]);
    setInviteDefaultStudioId('');
    setInviteExtraStudioIds([]);
    setInviteSubmitError('');
  };

  const submitInvite = async () => {
    setInviteSubmitError('');
    const email = inviteEmail.trim();
    const seedName = inviteName.trim();
    if (!email || !seedName) {
      setInviteSubmitError('Email and name are required.');
      return;
    }
    if (inviteRole === 'DEPARTMENT_USER' && inviteDepartments.length === 0) {
      setInviteSubmitError('Select at least one department.');
      return;
    }
    if (inviteRole === 'STUDIO_USER' && !inviteDefaultStudioId) {
      setInviteSubmitError('Select a default location.');
      return;
    }
    setInviteSubmitting(true);
    try {
      const body: Parameters<typeof adminApi.invitations.create>[0] = {
        email,
        seedName,
        assignedRole: inviteRole,
      };
      if (inviteRole === 'DEPARTMENT_USER') body.departments = inviteDepartments;
      if (inviteRole === 'STUDIO_USER') {
        if (inviteDefaultStudioId === DEFAULT_LOCATION_ALL_VALUE) {
          body.defaultStudioId = DEFAULT_LOCATION_ALL_VALUE;
        } else {
          body.defaultStudioId = inviteDefaultStudioId;
          const extra = inviteExtraStudioIds.filter((id) => id && id !== inviteDefaultStudioId);
          if (extra.length) body.additionalStudioIds = extra;
        }
      }
      await adminApi.invitations.create(body);
      setAddUserModalOpen(false);
      await qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: Record<string, unknown> } };
      const raw = ax.response?.data;
      const code = typeof raw?.code === 'string' ? raw.code : undefined;
      const msg =
        typeof raw?.message === 'string'
          ? raw.message
          : Array.isArray(raw?.message) && typeof raw.message[0] === 'string'
            ? raw.message[0]
            : undefined;
      if (ax.response?.status === 409) {
        if (code === 'EMAIL_IN_USE') {
          setInviteSubmitError('That email already has an account.');
        } else if (code === 'PENDING_INVITE_EXISTS') {
          setInviteSubmitError('A pending invitation already exists for that email. Resend or revoke it below.');
        } else {
          setInviteSubmitError(msg ?? 'This email conflicts with an existing user or invitation.');
        }
      } else {
        setInviteSubmitError(msg ?? 'Could not send invitation. Try again.');
      }
    } finally {
      setInviteSubmitting(false);
    }
  };

  const aiAgentUsers = useMemo(() => users.filter(isAiDepartmentAgentUser), [users]);
  const nonAiUsers = useMemo(() => users.filter((u) => !isAiDepartmentAgentUser(u)), [users]);

  const filteredUsers = useMemo(
    () => nonAiUsers.filter((u) => userMatchesTableFilters(u, searchQuery, roleFilter, departmentFilter)),
    [nonAiUsers, searchQuery, roleFilter, departmentFilter],
  );

  const aiAgentRowVisible = useMemo(
    () =>
      aiAgentUsers.length > 0 &&
      aiAgentUsers.some((u) => userMatchesTableFilters(u, searchQuery, roleFilter, departmentFilter)),
    [aiAgentUsers, searchQuery, roleFilter, departmentFilter],
  );

  const aiAgentAllActive = aiAgentUsers.length > 0 && aiAgentUsers.every((u) => u.isActive);

  /** Row count for header: real people + one slot for bundled AI agents. */
  const usersListDisplayTotal = nonAiUsers.length + (aiAgentUsers.length > 0 ? 1 : 0);

  const handleSave = async (userId: string) => {
    const role = roleDrafts[userId];
    const departmentsToSet = departmentDrafts[userId] ?? [];
    if (!role) {
      setRowMessages((prev) => ({ ...prev, [userId]: 'Role is required.' }));
      return;
    }
    if (role === 'DEPARTMENT_USER' && departmentsToSet.length === 0) {
      setRowMessages((prev) => ({ ...prev, [userId]: 'Select at least one department.' }));
      return;
    }

    setSavingRows((prev) => ({ ...prev, [userId]: true }));
    setRowMessages((prev) => ({ ...prev, [userId]: '' }));
    try {
      await roleMut.mutateAsync({ id: userId, role });
      if (role === 'DEPARTMENT_USER') {
        await departmentsMut.mutateAsync({ id: userId, departments: departmentsToSet });
      }
      setEditableRows((prev) => ({ ...prev, [userId]: false }));
      setRowMessages((prev) => ({ ...prev, [userId]: 'Saved' }));
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Save failed. Try again.';
      setRowMessages((prev) => ({ ...prev, [userId]: message ?? 'Save failed. Try again.' }));
    } finally {
      setSavingRows((prev) => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col" style={{ background: 'var(--color-bg-page)' }}>
      <Header title={isLoading ? 'Users' : `Users (${usersListDisplayTotal})`} />
      {addUserModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => !inviteSubmitting && setAddUserModalOpen(false)}
        >
          <div
            className="rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--color-bg-surface-raised)',
              border: '1px solid var(--color-border-default)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Invite user
              </h2>
              <button
                type="button"
                onClick={() => !inviteSubmitting && setAddUserModalOpen(false)}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--color-bg-surface)]"
                style={{ color: 'var(--color-text-muted)' }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
              We will email a one-time link to finish account setup. Name and role cannot be changed by the invitee.
            </p>
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full"
                disabled={inviteSubmitting}
              />
              <Input
                type="text"
                placeholder="Full name (required)"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="w-full"
                disabled={inviteSubmitting}
              />
              <Select
                value={inviteRole}
                onChange={(e) => {
                  const r = e.target.value as UserRole;
                  setInviteRole(r);
                  if (r !== 'DEPARTMENT_USER') setInviteDepartments([]);
                  if (r !== 'STUDIO_USER') {
                    setInviteDefaultStudioId('');
                    setInviteExtraStudioIds([]);
                  }
                }}
                className="w-full"
                disabled={inviteSubmitting}
              >
                <option value="STUDIO_USER">Studio User</option>
                <option value="DEPARTMENT_USER">Department User</option>
                <option value="ADMIN">Admin</option>
              </Select>
              {inviteRole === 'DEPARTMENT_USER' && (
                <MultiComboBox
                  id="invite-departments"
                  options={DEPARTMENT_OPTIONS}
                  value={inviteDepartments}
                  onChange={(next) => setInviteDepartments(next as Department[])}
                  placeholder="Departments…"
                  disabled={inviteSubmitting}
                  className="w-full"
                />
              )}
              {inviteRole === 'STUDIO_USER' && (
                <>
                  <Select
                    value={inviteDefaultStudioId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setInviteDefaultStudioId(v);
                      if (v === DEFAULT_LOCATION_ALL_VALUE) {
                        setInviteExtraStudioIds([]);
                      } else {
                        setInviteExtraStudioIds((prev) => prev.filter((id) => id !== v));
                      }
                    }}
                    className="w-full"
                    disabled={inviteSubmitting}
                  >
                    <option value="">Default location…</option>
                    <option value={DEFAULT_LOCATION_ALL_VALUE}>{DEFAULT_LOCATION_ALL_LABEL}</option>
                    {inviteStudios.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                  <MultiComboBox
                    id="invite-extra-studios"
                    options={inviteStudios
                      .filter(
                        (s) =>
                          inviteDefaultStudioId &&
                          inviteDefaultStudioId !== DEFAULT_LOCATION_ALL_VALUE &&
                          s.id !== inviteDefaultStudioId,
                      )
                      .map((s) => ({ value: s.id, label: s.name }))}
                    value={inviteExtraStudioIds}
                    onChange={(next) => setInviteExtraStudioIds(next)}
                    placeholder="Additional locations (optional)"
                    disabled={
                      inviteSubmitting || inviteDefaultStudioId === DEFAULT_LOCATION_ALL_VALUE
                    }
                    className="w-full"
                  />
                </>
              )}
              {inviteSubmitError && (
                <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{inviteSubmitError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="secondary" size="sm" onClick={() => setAddUserModalOpen(false)} disabled={inviteSubmitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submitInvite()} loading={inviteSubmitting}>
                Send invitation
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="p-6">
        <div className="mb-4 flex items-center gap-4 flex-wrap justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <ComboBox
              options={[
                { value: '', label: 'All types' },
                { value: 'ADMIN', label: 'Admin' },
                { value: 'DEPARTMENT_USER', label: 'Department level' },
                { value: 'STUDIO_USER', label: 'Studio level' },
              ]}
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v);
                if (v !== 'DEPARTMENT_USER') setDepartmentFilter('');
              }}
              placeholder="User type"
              className="min-w-[160px]"
              closeOnScroll
            />
            {roleFilter === 'DEPARTMENT_USER' && (
              <ComboBox
                options={[
                  { value: '', label: 'All departments' },
                  ...DEPARTMENT_OPTIONS.map((d) => ({ value: d.value, label: d.label })),
                ]}
                value={departmentFilter}
                onChange={setDepartmentFilter}
                placeholder="Department"
                className="min-w-[160px]"
                closeOnScroll
              />
            )}
          </div>
          <Button size="md" onClick={openInviteModal}>
            <Plus className="h-4 w-4" />
            Add new user
          </Button>
        </div>

        <div className="dashboard-card mb-6 rounded-xl overflow-hidden" style={panel}>
          <div className="px-4 py-3 text-sm font-semibold" style={{ background: 'var(--color-bg-content-header)', color: 'var(--color-text-primary)' }}>
            Pending invitations
          </div>
          {invitesLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            </div>
          ) : pendingInvites.length === 0 ? (
            <div className="px-4 py-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>No pending invitations.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: POLISH_THEME.tableHeaderBg }}>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Email</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Name</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Role</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Expires</th>
                  <th className={POLISH_CLASS.adminTableHeaderRight} style={{ color: POLISH_THEME.theadText }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((inv, i) => (
                  <tr key={inv.id} className={POLISH_CLASS.adminRow} style={{ borderTop: i > 0 ? `1px solid ${POLISH_THEME.innerBorder}` : undefined }}>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-primary)' }}>{inv.emailNormalized}</td>
                    <td className="px-4 py-3" style={{ color: POLISH_THEME.metaSecondary }}>{inv.seedName}</td>
                    <td className="px-4 py-3" style={{ color: POLISH_THEME.metaSecondary }}>{inv.assignedRole}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: POLISH_THEME.metaMuted }}>
                      {new Date(inv.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await adminApi.invitations.resend(inv.id);
                            await qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
                          } catch (e: unknown) {
                            const ax = e as { response?: { status?: number; data?: { message?: string } } };
                            if (ax.response?.status === 429) {
                              alert(ax.response?.data?.message ?? 'Resend limit reached.');
                            } else {
                              alert(ax.response?.data?.message ?? 'Resend failed.');
                            }
                          }
                        }}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (!confirm('Regenerate link? The previous link will stop working.')) return;
                          await adminApi.invitations.regenerate(inv.id);
                          await qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
                        }}
                      >
                        New link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: 'var(--color-danger)' } as React.CSSProperties}
                        onClick={async () => {
                          if (!confirm('Revoke this invitation?')) return;
                          await adminApi.invitations.revoke(inv.id);
                          await qc.invalidateQueries({ queryKey: ['admin', 'invitations'] });
                        }}
                      >
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
            </div>
          ) : filteredUsers.length === 0 && users.length > 0 && !aiAgentRowVisible ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No users match your search.
            </div>
          ) : (
            <table
              className={cn(
                'w-full text-sm',
                // When a row is tall (Role editor), center single-line cells vertically.
                '[&_tbody>tr>td]:align-middle',
              )}
            >
              <thead>
                <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Name</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Email</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Role</th>
                  <th className={POLISH_CLASS.adminTableHeader} style={{ color: POLISH_THEME.theadText }}>Visibility</th>
                  <th className={POLISH_CLASS.adminTableHeaderRight} style={{ color: POLISH_THEME.theadText }}>Status</th>
                  <th className={POLISH_CLASS.adminTableHeaderRight} style={{ color: POLISH_THEME.theadText }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {aiAgentRowVisible && (
                  <tr
                    key="__ai_agent_account__"
                    className="transition-colors hover:bg-[rgba(52,120,196,0.12)]"
                    style={{
                      background: 'rgba(52, 120, 196, 0.09)',
                      borderBottom: `1px solid ${POLISH_THEME.rowBorder}`,
                    }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      <span className="inline-flex items-center gap-2">
                        <Bot className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
                        AI Agent Account
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>
                      {AI_AGENT_DISPLAY_EMAIL}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      <div className={cn('flex items-center', AI_AGENT_ROLE_CELL_MIN_INNER_CLASS)}>
                        Universal
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
                        All knowing
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={
                          aiAgentAllActive
                            ? { background: 'rgba(34,197,94,0.12)', color: POLISH_THEME.success }
                            : { background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }
                        }
                      >
                        {aiAgentAllActive ? 'Active' : 'Mixed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-center">
                      <div className="flex justify-center">
                        <InfoPopover
                          ariaLabel="About AI Agent Account?"
                          direction="down"
                          trigger="letterISolidAccent"
                          panelWidth={530}
                          variant="center"
                          footerLogoSrc="/favicon.png"
                          centerScale={1.7}
                          centerFooterExtraGapPx={40}
                        >
                          <p className="pr-9 font-semibold mb-4" style={{ color: 'var(--color-accent)' }}>
                            AI Agent Account?
                          </p>
                          <ul className="mb-5 list-disc space-y-4 pl-7" style={{ color: 'var(--color-text-secondary)' }}>
                            <li>
                              This is an AI Account that has the ability to be configured to handle any
                              &apos;digital action&apos; ticket subtasks.
                            </li>
                            <li>
                              Once configured by the developer, Admin can assign any qualified subtasks to the AI
                              Agent Account to be automatically completed.
                            </li>
                          </ul>
                          <p className="mb-4 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                            How do I assign tasks to it?
                          </p>
                          <ul className="list-disc space-y-4 pl-7" style={{ color: 'var(--color-text-secondary)' }}>
                            <li>
                              When adding a subtask to a workflow template, simply select the &apos;AI Agent
                              Account&apos; as the &apos;assigned user&apos; for that subtask.
                            </li>
                          </ul>
                        </InfoPopover>
                      </div>
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u, i) => {
                  const draftRole = roleDrafts[u.id] ?? u.role;
                  const draftDepartments = departmentDrafts[u.id] ?? [];
                  const deptUserNeedsDepartment = draftRole === 'DEPARTMENT_USER';
                  const isEditable = editableRows[u.id] ?? false;
                  const isSaving = savingRows[u.id] ?? false;
                  const rowMessage = rowMessages[u.id];
                  return (
                  <tr
                    key={u.id}
                    className={POLISH_CLASS.adminRow}
                    style={{
                      borderTop:
                        aiAgentRowVisible || i > 0 ? `1px solid ${POLISH_THEME.rowBorder}` : undefined,
                    }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>{u.displayName}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-muted)' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {roleDisplayLabel(draftRole, draftDepartments.length ? draftDepartments : null)}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <InstantTooltip
                            content={isEditable ? 'Cancel editing' : 'Edit user permissions'}
                            compact
                            className="inline-flex shrink-0"
                          >
                            <button
                              type="button"
                              className={cn(
                                'relative h-9 w-9 shrink-0 rounded-full border-2 border-blue-600',
                                'flex items-center justify-center bg-[var(--color-bg-surface)]',
                                'hover:bg-blue-50/90 dark:hover:bg-blue-950/40 transition-colors duration-200',
                                'disabled:opacity-50 disabled:pointer-events-none',
                              )}
                              aria-label={isEditable ? 'Cancel editing' : 'Edit user permissions'}
                              disabled={isSaving}
                              onClick={() => {
                                if (isEditable) {
                                  setRoleDrafts((prev) => ({ ...prev, [u.id]: u.role }));
                                  setDepartmentDrafts((prev) => ({ ...prev, [u.id]: u.departments ?? [] }));
                                  setEditableRows((prev) => ({ ...prev, [u.id]: false }));
                                  setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                                } else {
                                  setEditableRows((prev) => ({ ...prev, [u.id]: true }));
                                  setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                                }
                              }}
                            >
                              <span
                                className={cn(
                                  'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
                                  isEditable ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100',
                                )}
                                aria-hidden={isEditable}
                              >
                                <EditPencilIcon className="text-blue-600" />
                              </span>
                              <span
                                className={cn(
                                  'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
                                  isEditable ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none',
                                )}
                                aria-hidden={!isEditable}
                              >
                                <X className="h-4 w-4 text-blue-600" strokeWidth={2.5} />
                              </span>
                            </button>
                          </InstantTooltip>
                          <Select
                            value={draftRole}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRole;
                              setRoleDrafts((prev) => ({ ...prev, [u.id]: nextRole }));
                              if (nextRole !== 'DEPARTMENT_USER') {
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: [] }));
                              } else {
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: draftDepartments.length ? draftDepartments : ['MARKETING'] }));
                              }
                              setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                            }}
                            className="w-36"
                            disabled={!isEditable || isSaving}
                          >
                            <option value="STUDIO_USER">Studio User</option>
                            <option value="DEPARTMENT_USER">Department User</option>
                            <option value="ADMIN">Admin</option>
                          </Select>
                          {deptUserNeedsDepartment && (
                            <MultiComboBox
                              id={`user-${u.id}-departments`}
                              options={DEPARTMENT_OPTIONS}
                              value={draftDepartments}
                              onChange={(next) => {
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: next as Department[] }));
                                setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                              }}
                              placeholder="Select departments…"
                              disabled={!isEditable || isSaving}
                              className="w-36 min-w-0 shrink-0"
                            />
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSave(u.id)}
                            disabled={!isEditable || isSaving}
                            loading={isSaving}
                            className="min-w-[72px]"
                          >
                            {!isEditable ? 'Saved' : 'Save'}
                          </Button>
                        </div>
                        {rowMessage && (
                          <span
                            className="text-[11px]"
                            style={{ color: rowMessage === 'Saved' ? POLISH_THEME.success : 'var(--color-danger)' }}
                          >
                            {rowMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'STUDIO_USER' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocationsModalUserId(u.id)}
                          title="Manage locations"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Locations ({visibilityLocationCount(u)})
                        </Button>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={u.isActive
                          ? { background: 'rgba(34,197,94,0.12)', color: POLISH_THEME.success }
                          : { background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 pl-6 text-right">
                      {u.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: 'var(--color-danger)' } as React.CSSProperties}
                          onClick={() => setDeactivateConfirmUserId(u.id)}
                          loading={deactivateMut.isPending && deactivateConfirmUserId === u.id}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        </div>
      </div>

      {/* Stage 23: Manage locations modal for studio users */}
      {locationsModalUserId && (
        <ManageLocationsModal
          user={users.find((u) => u.id === locationsModalUserId) as User | undefined}
          onClose={() => setLocationsModalUserId(null)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {/* Deactivate confirmation modal */}
      {deactivateConfirmUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => e.target === e.currentTarget && setDeactivateConfirmUserId(null)}
        >
          <div
            className="rounded-xl max-w-md w-full p-6"
            style={{ background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Deactivate user?</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              This user will no longer be able to sign in or access the system. Their ticket history will remain in the system.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeactivateConfirmUserId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  const id = deactivateConfirmUserId;
                  setDeactivateConfirmUserId(null);
                  deactivateMut.mutate(id);
                }}
                loading={deactivateMut.isPending}
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManageLocationsModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User | undefined;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const { data: studiosData } = useQuery({
    queryKey: ['admin', 'studios'],
    queryFn: () => adminApi.listStudios(),
    enabled: !!user,
  });
  const studios: { id: string; name: string }[] = studiosData?.data ?? [];

  const { data: scopesData } = useQuery({
    queryKey: ['users', user?.id, 'studio-scopes'],
    queryFn: () => usersApi.listStudioScopes(user!.id),
    enabled: !!user?.id,
  });
  const scopes = scopesData?.data ?? [];

  const setDefaultStudioMut = useMutation({
    mutationFn: (studioId: string | null) => usersApi.setDefaultStudio(user!.id, studioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });

  const grantAllStudioScopesMut = useMutation({
    mutationFn: () => usersApi.grantAllStudioScopes(user!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });

  /** After “all studios”, picking one default should drop extras so visibility matches that single home. */
  const narrowToDefaultStudioMut = useMutation({
    mutationFn: async (studioId: string) => {
      await usersApi.setDefaultStudio(user!.id, studioId);
      await usersApi.removeAllStudioScopes(user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });

  /** From “all studios”, None should clear default and additional scopes. */
  const clearDefaultFromAllMut = useMutation({
    mutationFn: async () => {
      await usersApi.setDefaultStudio(user!.id, null);
      await usersApi.removeAllStudioScopes(user!.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });
  const addScopeMut = useMutation({
    mutationFn: (studioId: string) => usersApi.addStudioScope(user!.id, studioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });
  const removeScopeMut = useMutation({
    mutationFn: (studioId: string) => usersApi.removeStudioScope(user!.id, studioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', user?.id, 'studio-scopes'] });
      onSuccess();
    },
  });

  const visibleStudioIds = useMemo(() => {
    const s = new Set<string>();
    if (user?.studioId) s.add(user.studioId);
    scopes.forEach((row) => s.add(row.studioId));
    return s;
  }, [user?.studioId, scopes]);

  const hasAllStudios =
    studios.length > 0 && studios.every((st) => visibleStudioIds.has(st.id));
  const defaultLocationSelectValue = hasAllStudios
    ? DEFAULT_LOCATION_ALL_VALUE
    : (user?.studioId ?? '');

  const locationSelectBusy =
    setDefaultStudioMut.isPending ||
    grantAllStudioScopesMut.isPending ||
    narrowToDefaultStudioMut.isPending ||
    clearDefaultFromAllMut.isPending;

  const onDefaultLocationChange = useCallback(
    (value: string) => {
      if (value === DEFAULT_LOCATION_ALL_VALUE) {
        grantAllStudioScopesMut.mutate();
        return;
      }
      if (value === '') {
        if (hasAllStudios) clearDefaultFromAllMut.mutate();
        else setDefaultStudioMut.mutate(null);
        return;
      }
      if (hasAllStudios) narrowToDefaultStudioMut.mutate(value);
      else setDefaultStudioMut.mutate(value);
    },
    [
      hasAllStudios,
      grantAllStudioScopesMut,
      clearDefaultFromAllMut,
      narrowToDefaultStudioMut,
      setDefaultStudioMut,
    ],
  );

  if (!user) return null;

  const alreadyAdded = new Set([user.studioId].filter(Boolean));
  scopes.forEach((s) => alreadyAdded.add(s.studioId));
  const studiosToAdd = studios.filter((s) => !alreadyAdded.has(s.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
        style={{ background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Manage locations — {user.displayName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded transition-colors hover:text-[var(--color-text-primary)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Default location
            </label>
            <Select
              value={defaultLocationSelectValue}
              onChange={(e) => onDefaultLocationChange(e.target.value)}
              disabled={locationSelectBusy}
              className="w-full"
            >
              <option value="">None</option>
              <option value={DEFAULT_LOCATION_ALL_VALUE}>{DEFAULT_LOCATION_ALL_LABEL}</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              Additional locations
            </label>
            {scopes.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No additional locations.</p>
            ) : (
              <ul className="space-y-2">
                {scopes.map((s) => (
                  <li key={s.studioId} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)' }}>
                    <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{s.studio?.name ?? s.studioId}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: 'var(--color-danger)' } as React.CSSProperties}
                      onClick={() => removeScopeMut.mutate(s.studioId)}
                      disabled={removeScopeMut.isPending}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {studiosToAdd.length > 0 && (
              <div className="mt-2 flex gap-2">
                <Select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) addScopeMut.mutate(id);
                    e.target.value = '';
                  }}
                  disabled={addScopeMut.isPending}
                  className="flex-1"
                >
                  <option value="">Add location…</option>
                  {studiosToAdd.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
