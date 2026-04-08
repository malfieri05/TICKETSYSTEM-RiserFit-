'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Workflow } from 'lucide-react';
import { workflowTemplatesApi, workflowAnalyticsApi, type WorkflowTemplateAnalyticsRow } from '@/lib/api';
import type { WorkflowTemplateListItemDto } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { HeaderInfoButton, InfoExplainerModal } from '@/components/ui/InfoExplainer';
import { cn } from '@/lib/utils';
import { WorkflowAnalyticsPanel, formatWorkflowAnalyticsHours } from '@/components/admin/WorkflowAnalyticsPanel';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

const tableHeaderBg = POLISH_THEME.feedTheadBg;

/** Fixed-width trio; parent cell uses flex justify-center so it sits in the middle of the flexible metrics column. */
const metricsGridInnerClass =
  'grid w-[21rem] max-w-full grid-cols-3 gap-x-6 justify-items-center text-center tabular-nums';

/** Ticket class (bold) | template name — matches analytics “Template” column when present. */
function TemplateCell({
  t,
  analytics: a,
}: {
  t: WorkflowTemplateListItemDto;
  analytics: WorkflowTemplateAnalyticsRow | undefined;
}) {
  const ticketClass = t.ticketClass?.name ?? 'Ticket';
  const topic = a?.templateName?.trim() || t.name?.trim() || '—';
  return (
    <span className="block max-w-xl pr-3 leading-snug">
      <span className="font-semibold text-[var(--color-text-primary)]">{ticketClass}</span>
      <span className="font-normal text-[var(--color-text-muted)]"> | </span>
      <span className="font-normal text-[var(--color-text-primary)]">{topic}</span>
    </span>
  );
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
  const [workflowTemplatesInfoOpen, setWorkflowTemplatesInfoOpen] = useState(false);
  const closeWorkflowTemplatesInfo = useCallback(() => setWorkflowTemplatesInfoOpen(false), []);
  const [pickedTemplateId, setPickedTemplateId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: () => workflowTemplatesApi.list(),
  });
  const templates = useMemo(() => data?.data ?? [], [data?.data]);

  const analyticsQuery = useQuery({
    queryKey: ['workflow-analytics', 'templates'],
    queryFn: () => workflowAnalyticsApi.getTemplates().then((r) => r.data),
  });
  const analyticsRows = useMemo(
    () => (analyticsQuery.data ?? []) as WorkflowTemplateAnalyticsRow[],
    [analyticsQuery.data],
  );
  const analyticsById = useMemo(() => {
    const m = new Map<string, WorkflowTemplateAnalyticsRow>();
    analyticsRows.forEach((r) => m.set(r.templateId, r));
    return m;
  }, [analyticsRows]);

  const selectedTemplateId = useMemo(() => {
    if (templates.length === 0) return '';
    if (pickedTemplateId && templates.some((t) => t.id === pickedTemplateId)) return pickedTemplateId;
    return templates[0].id;
  }, [templates, pickedTemplateId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );
  const selectedAnalytics = selectedTemplateId ? analyticsById.get(selectedTemplateId) : undefined;
  const subtaskSectionTitle =
    selectedAnalytics?.templateName?.trim() ||
    selectedTemplate?.name?.trim() ||
    selectedTemplate?.id ||
    '';

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        titleIcon={Workflow}
        title={
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="min-w-0 truncate text-base font-semibold"
              style={{ color: 'var(--color-text-app-header)' }}
            >
              Workflow Templates
            </h1>
            <HeaderInfoButton
              onClick={() => setWorkflowTemplatesInfoOpen(true)}
              ariaLabel="What are Workflow templates? Opens an explanation."
            />
          </div>
        }
      />
      <InfoExplainerModal
        open={workflowTemplatesInfoOpen}
        onClose={closeWorkflowTemplatesInfo}
        titleId="workflow-templates-about-title"
        title={<>What are &apos;Workflow templates&apos;?</>}
      >
        <ul className="list-disc space-y-2 pl-4" style={{ color: 'var(--color-text-secondary)' }}>
          <li>
            Workflow Templates page is where admin can set the subtask templates and responsible parties per
            each ticket type.
          </li>
          <li>
            Once a workflow template is created and &apos;active&apos;, then each new ticket created for that
            category or topic uses that workflow template.
          </li>
        </ul>
      </InfoExplainerModal>
      <div className="w-full p-6">
        <div className="mb-4 flex justify-start">
          <Button size="sm" onClick={() => router.push('/admin/workflow-templates/new')}>
            <Plus className="h-4 w-4" />
            New Workflow Template
          </Button>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">Workflow Templates:</h2>
        {analyticsQuery.error && (
          <div className="mb-3 rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            Failed to load workflow analytics. Subtask timing may be unavailable.
          </div>
        )}
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
            <table className="w-full min-w-[60rem] table-fixed text-sm">
              <colgroup>
                <col style={{ width: '38%' }} />
                <col />
                <col style={{ width: '5rem' }} />
                <col style={{ width: '9rem' }} />
                <col style={{ width: '9.5rem' }} />
              </colgroup>
              <thead>
                <tr className={POLISH_CLASS.workflowTemplatesTheadRow}>
                  <th
                    className="rounded-tl-xl px-4 text-left align-middle font-semibold text-[var(--color-text-primary)]"
                    style={{ background: tableHeaderBg }}
                  >
                    Template
                  </th>
                  <th
                    className="!px-0 !py-0 align-middle font-semibold text-[var(--color-text-primary)]"
                    style={{ background: tableHeaderBg }}
                  >
                    <div className="flex w-full justify-center px-2 py-3">
                      <div className={metricsGridInnerClass}>
                        <span className="whitespace-nowrap">Total</span>
                        <span className="whitespace-nowrap">Active</span>
                        <span className="whitespace-nowrap">Avg. completion</span>
                      </div>
                    </div>
                  </th>
                  <th
                    className="whitespace-nowrap px-2 text-center font-semibold text-[var(--color-text-primary)]"
                    style={{ background: tableHeaderBg }}
                  >
                    Subtasks
                  </th>
                  <th
                    className="px-3 text-center font-semibold text-[var(--color-text-primary)]"
                    style={{ background: tableHeaderBg }}
                  >
                    Status
                  </th>
                  <th
                    className="rounded-tr-xl whitespace-nowrap px-3 text-center font-semibold text-[var(--color-text-primary)]"
                    style={{ background: tableHeaderBg }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const a = analyticsById.get(t.id);
                  const isSelected = t.id === selectedTemplateId;
                  return (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      aria-selected={isSelected}
                      aria-label={`${t.name ?? t.id}, show subtask timing`}
                      onClick={() => setPickedTemplateId(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPickedTemplateId(t.id);
                        }
                      }}
                      className={cn(
                        'cursor-pointer outline-none transition-[background-color,box-shadow] duration-150',
                        'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]',
                        isSelected
                          ? 'hover:bg-[rgba(52,120,196,0.16)]'
                          : 'hover:bg-[var(--color-bg-surface-raised)]',
                      )}
                      style={{
                        borderBottom: '1px solid var(--color-border-default)',
                        background: isSelected ? POLISH_THEME.adminStudioListSelectedBg : undefined,
                        boxShadow: isSelected ? 'inset 3px 0 0 var(--color-accent)' : undefined,
                      }}
                    >
                      <td className="px-4 py-3 align-middle">
                        <TemplateCell t={t} analytics={a} />
                      </td>
                      <td className="align-middle px-0 py-3">
                        <div className="flex w-full justify-center px-2">
                          <div className={metricsGridInnerClass}>
                            <span className="whitespace-nowrap text-[var(--color-text-primary)]">
                              {a ? a.totalExecutions : '—'}
                            </span>
                            <span className="whitespace-nowrap text-[var(--color-text-primary)]">
                              {a ? a.activeExecutions : '—'}
                            </span>
                            <span className="whitespace-nowrap text-[var(--color-text-secondary)]">
                              {a ? formatWorkflowAnalyticsHours(a.avgCompletionTimeHours) : '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-center align-middle tabular-nums text-[var(--color-text-secondary)]">
                        {t._count?.subtaskTemplates ?? 0}
                      </td>
                      <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                        <WorkflowTemplateStatusToggle templateId={t.id} isActive={t.isActive} />
                      </td>
                      <td
                        className="px-3 py-3 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link
                          href={`/admin/workflow-templates/${t.id}`}
                          className="inline-flex whitespace-nowrap rounded-md border border-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                        >
                          View / Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {templates.length > 0 && (
          <WorkflowAnalyticsPanel
            selectedTemplateId={selectedTemplateId}
            subtaskSectionTitle={subtaskSectionTitle}
            analyticsLoading={analyticsQuery.isLoading}
          />
        )}
      </div>
    </div>
  );
}
