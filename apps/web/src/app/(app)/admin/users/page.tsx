'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { usersApi } from '@/lib/api';
import type { UserRole, Department } from '@/types';

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
        const departmentsToSet = department ? [department] : ['MARKETING'];
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
        <div className="rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
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
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={u.isActive
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
                          : { background: '#222222', color: '#666666' }}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: '#f87171' } as React.CSSProperties}
                          onClick={() => deactivateMut.mutate(u.id)}
                          loading={deactivateMut.isPending}
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
  );
}
