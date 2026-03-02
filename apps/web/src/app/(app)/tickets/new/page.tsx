'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ticketsApi, usersApi } from '@/lib/api';
import type { TicketPriority } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'AGENT',
  });
  const agents = (usersData?.data ?? []).filter((u) => u.role === 'AGENT' || u.role === 'ADMIN');

  const mutation = useMutation({
    mutationFn: () =>
      ticketsApi.create({
        title,
        description: description || undefined,
        priority,
        ownerId: ownerId || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      router.push(`/tickets/${res.data.id}`);
    },
    onError: () => setError('Failed to create ticket. Please try again.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError('');
    mutation.mutate();
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="New Ticket" />
      <div className="flex-1 p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">Create a new ticket</h2>

          <Input
            id="title"
            label="Title"
            placeholder="Brief summary of the issue"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <Textarea
            id="description"
            label="Description (optional)"
            placeholder="Provide additional details about the issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />

          <Select
            id="priority"
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>

          {(user?.role === 'ADMIN' || user?.role === 'AGENT') && (
            <Select
              id="owner"
              label="Assign to (optional)"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.displayName}</option>
              ))}
            </Select>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={mutation.isPending}>
              Create Ticket
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
