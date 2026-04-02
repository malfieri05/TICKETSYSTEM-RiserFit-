'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { workflowTemplatesApi } from '@/lib/api';
import type { WorkflowTemplateListItemDto } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

function contextLabel(t: WorkflowTemplateListItemDto): string {
  const parts: string[] = [t.ticketClass?.name ?? 'Ticket'];
  if (t.supportTopic) parts.push(t.supportTopic.name);
  else if (t.maintenanceCategory) parts.push(t.maintenanceCategory.name);
  if (t.name) parts.push(`— ${t.name}`);
  return parts.join(' · ');
}

export default function AdminWorkflowTemplatesListPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => workflowTemplatesApi.list(),
  });
  const templates = data?.data ?? [];

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title="Workflow Templates"
        action={
          <Button size="sm" onClick={() => router.push('/admin/workflow-templates/new')}>
            <Plus className="h-4 w-4" />
            New workflow template
          </Button>
        }
      />
      <div className="p-6 max-w-4xl">
        <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No workflow templates yet</p>
              <p className="text-xs text-center max-w-sm">Create a template to define subtask workflows for ticket types and categories.</p>
              <Button size="sm" onClick={() => router.push('/admin/workflow-templates/new')}>
                <Plus className="h-4 w-4" />
                New workflow template
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">Context</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">Subtasks</th>
                  <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-[var(--color-bg-surface)]"
                    style={{ borderBottom: '1px solid var(--color-border-default)' }}
                  >
                    <td className="py-3 px-4 text-[var(--color-text-primary)]">{contextLabel(t)}</td>
                    <td className="py-3 px-4 text-[var(--color-text-secondary)]">{t._count?.subtaskTemplates ?? 0}</td>
                    <td className="py-3 px-4">
                      <span className={t.isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/workflow-templates/${t.id}`}
                        className="text-[var(--color-accent)] hover:text-[var(--color-accent)] text-sm font-medium"
                      >
                        View / Edit
                      </Link>
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
