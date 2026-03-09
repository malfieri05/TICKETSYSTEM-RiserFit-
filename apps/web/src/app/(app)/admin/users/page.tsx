'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pencil, MapPin, X } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Select, Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { usersApi, adminApi } from '@/lib/api';
import type { UserRole, Department, User } from '@/types';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

// Backend enum: HR | OPERATIONS | MARKETING. Display labels for dropdown.
const DEPARTMENT_OPTIONS: { value: Department; label: string }[] = [
  { value: 'HR', label: 'HR' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'MARKETING', label: 'Marketing' },
];

function roleDisplayLabel(role: string, departmentLabel?: string | null): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'STUDIO_USER') return 'Studio User';
  if (role === 'DEPARTMENT_USER') return departmentLabel ?? 'Unassigned Department';
  return role;
}

/** Unique location count for STUDIO_USER (default + scope studios, no double-count). */
function visibilityLocationCount(u: User): number {
  const ids: string[] = [...(u.studioId ? [u.studioId] : []), ...(u.scopeStudioIds ?? [])];
  return new Set(ids).size;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const users = data?.data ?? [];
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, Department | ''>>({});
  const [editableRows, setEditableRows] = useState<Record<string, boolean>>({});
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (users.length === 0) return;
    const nextRoles: Record<string, UserRole> = {};
    const nextDepts: Record<string, Department | ''> = {};
    users.forEach((u) => {
      nextRoles[u.id] = u.role;
      nextDepts[u.id] = u.departments?.[0] ?? (u.teamName === 'HR' || u.teamName === 'Operations' || u.teamName === 'Marketing' ? (u.teamName === 'Operations' ? 'OPERATIONS' : u.teamName === 'Marketing' ? 'MARKETING' : 'HR') : '');
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

  const filteredUsers = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = (u.displayName ?? '').toLowerCase();
      const email = (u.email ?? '').toLowerCase();
      const dept = u.departments?.[0];
      const departmentLabel = dept ? DEPARTMENT_OPTIONS.find((d) => d.value === dept)?.label ?? null : null;
      const roleLabel = roleDisplayLabel(u.role, departmentLabel).toLowerCase();
      const defaultLocation = (u.studio?.name ?? '').toLowerCase();
      return name.includes(q) || email.includes(q) || roleLabel.includes(q) || defaultLocation.includes(q);
    });
  })();

  const handleSave = async (userId: string) => {
    const role = roleDrafts[userId];
    const department = departmentDrafts[userId];
    if (!role) {
      setRowMessages((prev) => ({ ...prev, [userId]: 'Role is required.' }));
      return;
    }

    setSavingRows((prev) => ({ ...prev, [userId]: true }));
    setRowMessages((prev) => ({ ...prev, [userId]: '' }));
    try {
      await roleMut.mutateAsync({ id: userId, role });
      if (role === 'DEPARTMENT_USER') {
        const departmentsToSet: Department[] = department ? [department as Department] : ['MARKETING'];
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
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Users" />
      <div className="p-6">
        <div className="mb-4">
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
            </div>
          ) : filteredUsers.length === 0 && users.length > 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: '#888888' }}>
              No users match your search.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Visibility</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => {
                  const draftRole = roleDrafts[u.id] ?? u.role;
                  const draftDepartment = departmentDrafts[u.id] ?? '';
                  const departmentLabel = draftDepartment
                    ? DEPARTMENT_OPTIONS.find((d) => d.value === draftDepartment)?.label ?? draftDepartment
                    : null;
                  const deptUserNeedsDepartment = draftRole === 'DEPARTMENT_USER';
                  const isEditable = editableRows[u.id] ?? false;
                  const isSaving = savingRows[u.id] ?? false;
                  const rowMessage = rowMessages[u.id];
                  return (
                  <tr
                    key={u.id}
                    style={{ borderTop: i > 0 ? '1px solid #222222' : undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{u.displayName}</td>
                    <td className="px-4 py-3" style={{ color: '#666666' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px]" style={{ color: '#888888' }}>
                          {roleDisplayLabel(draftRole, departmentLabel)}
                        </span>
                        <div className="flex items-center gap-2">
                          <Select
                            value={draftRole}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRole;
                              setRoleDrafts((prev) => ({ ...prev, [u.id]: nextRole }));
                              if (nextRole !== 'DEPARTMENT_USER') {
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: '' }));
                              } else {
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: prev[u.id] || 'MARKETING' }));
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
                            <Select
                              value={draftDepartment}
                              onChange={(e) => {
                                const department = e.target.value as Department;
                                setDepartmentDrafts((prev) => ({ ...prev, [u.id]: department }));
                                setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                              }}
                              className="w-40"
                              disabled={!isEditable || isSaving}
                            >
                              <option value="" disabled>
                                Select department
                              </option>
                              {DEPARTMENT_OPTIONS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </Select>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditableRows((prev) => ({ ...prev, [u.id]: true }));
                              setRowMessages((prev) => ({ ...prev, [u.id]: '' }));
                            }}
                            disabled={isEditable || isSaving}
                            title="Edit role/department"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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
                            style={{ color: rowMessage === 'Saved' ? '#4ade80' : '#f87171' }}
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
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={u.isActive
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
                          : { background: '#222222', color: '#666666' }}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 pl-6 text-right">
                      {u.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: '#f87171' } as React.CSSProperties}
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
              style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Deactivate user?</h3>
              <p className="text-sm text-gray-400 mb-6">
                This user will no longer be able to sign in or access the system. Their ticket history will remain in the system.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDeactivateConfirmUserId(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  style={{ background: '#dc2626', color: '#fff' } as React.CSSProperties}
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

  if (!user) return null;

  const defaultStudioId = user.studioId ?? '';
  const scopeStudioIds = new Set(scopes.map((s) => s.studioId));
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
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-100">
            Manage locations — {user.displayName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-gray-500 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#888888' }}>
              Default location
            </label>
            <Select
              value={defaultStudioId}
              onChange={(e) => setDefaultStudioMut.mutate(e.target.value || null)}
              disabled={setDefaultStudioMut.isPending}
              className="w-full"
            >
              <option value="">None</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#888888' }}>
              Additional locations
            </label>
            {scopes.length === 0 ? (
              <p className="text-sm" style={{ color: '#666666' }}>No additional locations.</p>
            ) : (
              <ul className="space-y-2">
                {scopes.map((s) => (
                  <li key={s.studioId} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: '#111111', border: '1px solid #252525' }}>
                    <span className="text-sm text-gray-200">{s.studio?.name ?? s.studioId}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: '#f87171' } as React.CSSProperties}
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
