'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import type { Category } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/admin/categories'),
  });
}

export default function AdminCategoriesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useCategories();
  const categories = data?.data ?? [];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);

  const createMut = useMutation({
    mutationFn: () => api.post('/admin/categories', { name, description: description || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setName('');
      setDescription('');
      setAdding(false);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/admin/categories/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header
        title="Categories"
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Add Category
          </Button>
        }
      />
      <div className="p-6 space-y-4 max-w-2xl">
        {adding && (
          <div className="rounded-xl p-4 space-y-3" style={panel}>
            <h3 className="text-sm font-semibold text-gray-100">New Category</h3>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plumbing, HVAC, Electrical" />
            <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={!name.trim()} loading={createMut.isPending}>Save</Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
            </div>
          ) : categories.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#555555' }}>No categories yet. Add one above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#666666' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr
                    key={cat.id}
                    style={{ borderTop: i > 0 ? '1px solid #222222' : undefined }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#222222')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-200">{cat.name}</td>
                    <td className="px-4 py-3" style={{ color: '#666666' }}>{cat.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium"
                        style={cat.isActive
                          ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
                          : { background: '#222222', color: '#666666' }}>
                        {cat.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" onClick={() => toggleMut.mutate({ id: cat.id, isActive: !cat.isActive })}>
                        {cat.isActive ? 'Disable' : 'Enable'}
                      </Button>
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
