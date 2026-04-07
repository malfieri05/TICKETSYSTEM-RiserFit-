'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { workflowTemplatesApi } from '@/lib/api';
import type { WorkflowTemplateListItemDto } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

function contextLabel(t: WorkflowTemplateListItemDto): string {
  const parts: string[] = [t.ticketClass?.name ?? 'Ticket'];
  if (t.supportTopic) parts.push(t.supportTopic.name);
  else if (t.maintenanceCategory) parts.push(t.maintenanceCategory.name);
  if (t.name) parts.push(`— ${t.name}`);
  return parts.join(' · ');
}

/** Same interaction model as Rovi “Web access” (AiChatPanel); track uses success green when on. */
function WorkflowTemplateStatusToggle({
  templateId,
  isActive,
}: {
  templateId: string;
  isActive: boolean;
}) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (next: boolean) => workflowTemplatesApi.update(templateId, { isActive: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-templates'] });
      qc.invalidateQueries({ queryKey: ['workflow-template', templateId] });
    },
  });

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => mut.mutate(!isActive)}
        disabled={mut.isPending}
        className="focus-ring shrink-0 rounded-full p-0.5 transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-pressed={isActive}
        aria-label={isActive ? 'Active — click to deactivate template' : 'Inactive — click to activate template'}
      >
        <div
          className={cn(
            'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150',
            isActive
              ? 'bg-[var(--color-success)]'
              : 'border border-[var(--color-border-default)] bg-[var(--color-bg-surface-inset)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]',
          )}
        >
          <span
            className={cn(
              'absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
              isActive ? 'translate-x-[16px]' : 'translate-x-0',
            )}
            style={{
              boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
            }}
          />
        </div>
      </button>
      <span
        className="min-w-[3.25rem] text-xs font-medium tabular-nums"
        style={{ color: isActive ? 'var(--color-success)' : 'var(--color-text-muted)' }}
      >
        {isActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  );
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
      <Header title="Workflow Templates" />
      <div className="w-full p-6">
        <div className="mb-4 flex justify-start">
          <Button size="sm" onClick={() => router.push('/admin/workflow-templates/new')}>
            <Plus className="h-4 w-4" />
            New workflow template
          </Button>
        </div>
        <div className="dashboard-card overflow-x-auto rounded-xl" style={panel}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
              <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: 'var(--color-text-muted)' }}>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No workflow templates yet</p>
              <p className="text-xs text-center max-w-sm">Create a template to define subtask workflows for ticket types and categories.</p>
            </div>
          ) : (
            <table className="w-full min-w-[52rem] table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-24" />
                <col className="w-[9.5rem]" />
                <col className="w-32" />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                  <th className="py-3 px-4 text-left font-semibold text-[var(--color-text-primary)]">Context</th>
                  <th className="whitespace-nowrap py-3 px-4 text-left font-semibold text-[var(--color-text-primary)]">
                    Subtasks
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-[var(--color-text-primary)]">Status</th>
                  <th className="whitespace-nowrap py-3 px-4 text-right font-semibold text-[var(--color-text-primary)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-[var(--color-bg-surface)]"
                    style={{ borderBottom: '1px solid var(--color-border-default)' }}
                  >
                    <td className="py-3 px-4 align-top text-[var(--color-text-primary)]">
                      <span className="block pr-2">{contextLabel(t)}</span>
                    </td>
                    <td className="whitespace-nowrap py-3 px-4 align-top text-[var(--color-text-secondary)]">
                      {t._count?.subtaskTemplates ?? 0}
                    </td>
                    <td className="py-3 px-4 align-middle">
                      <WorkflowTemplateStatusToggle templateId={t.id} isActive={t.isActive} />
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
