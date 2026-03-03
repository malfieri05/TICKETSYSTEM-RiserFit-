'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { usersApi } from '@/lib/api';
import type { UserRole } from '@/types';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const users = data?.data ?? [];

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => usersApi.updateRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

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
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    style={{ borderTop: i > 0 ? '1px solid #222222' : undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{u.displayName}</td>
                    <td className="px-4 py-3" style={{ color: '#666666' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={u.role}
                        onChange={(e) => roleMut.mutate({ id: u.id, role: e.target.value as UserRole })}
                        className="w-36"
                      >
                        <option value="REQUESTER">Requester</option>
                        <option value="AGENT">Agent</option>
                        <option value="ADMIN">Admin</option>
                      </Select>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
