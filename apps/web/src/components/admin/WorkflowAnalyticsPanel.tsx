'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { workflowAnalyticsApi, type WorkflowSubtaskTimingRow } from '@/lib/api';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { cn } from '@/lib/utils';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

const deptCapsuleBase =
  'inline-block rounded-full border border-solid px-2 py-0.5 text-xs font-medium';

/** Department pill — colors from globals.css (data-theme), not Tailwind `dark:` (OS mismatch). */
function departmentCapsuleClassName(departmentName: string): string {
  const key = departmentName.trim().toLowerCase();
  switch (key) {
    case 'hr':
      return cn(deptCapsuleBase, 'workflow-dept-capsule--hr');
    case 'operations':
      return cn(deptCapsuleBase, 'workflow-dept-capsule--operations');
    case 'marketing':
      return cn(deptCapsuleBase, 'workflow-dept-capsule--marketing');
    case 'retail':
      return cn(deptCapsuleBase, 'workflow-dept-capsule--retail');
    default:
      return cn(
        deptCapsuleBase,
        'bg-[var(--color-bg-surface-raised)] text-[var(--color-text-secondary)] border-[var(--color-border-default)]',
      );
  }
}

const sortControlBtnClass =
  'rounded-md p-1 transition-all duration-150 hover:bg-[var(--color-bg-surface-raised)] hover:shadow-sm active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-drawer-canvas)]';

const analyticsHeaderBg = POLISH_THEME.feedTheadBg;

/** Shared with Workflow Templates list cells (Total / Active / Avg completion). */
export function formatWorkflowAnalyticsHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

type SortMode = 'template' | 'asc' | 'desc';

function SubtaskTimingCard({
  templateId,
  templatesLoading,
}: {
  templateId: string;
  templatesLoading: boolean;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('template');

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-analytics', 'subtask-timing', templateId],
    queryFn: () => workflowAnalyticsApi.getSubtaskTiming(templateId).then((r) => r.data),
    enabled: !!templateId,
  });

  const subtaskStepNumberById = useMemo(() => {
    const rows = data?.subtasks ?? [];
    if (rows.length === 0) return new Map<string, number>();
    const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
    const m = new Map<string, number>();
    ordered.forEach((r, i) => m.set(r.subtaskTemplateId, i + 1));
    return m;
  }, [data?.subtasks]);

  const sortedSubtasks = useMemo((): WorkflowSubtaskTimingRow[] => {
    const rows = data?.subtasks ?? [];
    if (sortMode === 'asc') {
      return [...rows].sort((a, b) => {
        if (a.avgDurationHours == null && b.avgDurationHours == null) return 0;
        if (a.avgDurationHours == null) return 1;
        if (b.avgDurationHours == null) return -1;
        return a.avgDurationHours - b.avgDurationHours;
      });
    }
    if (sortMode === 'desc') {
      return [...rows].sort((a, b) => {
        if (a.avgDurationHours == null && b.avgDurationHours == null) return 0;
        if (a.avgDurationHours == null) return 1;
        if (b.avgDurationHours == null) return -1;
        return b.avgDurationHours - a.avgDurationHours;
      });
    }
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data?.subtasks, sortMode]);

  const loading = templatesLoading || isLoading;

  return (
    <div className="dashboard-card flex flex-col overflow-hidden rounded-xl" style={panel}>
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
          <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
        </div>
      ) : !templateId ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          No workflow templates found. Create one in Admin → Workflow Templates.
        </div>
      ) : sortedSubtasks.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
          This template has no subtask steps yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={POLISH_CLASS.workflowTemplatesTheadRow}>
                <th
                  className="px-4 text-left font-semibold text-[var(--color-text-primary)]"
                  style={{ background: analyticsHeaderBg }}
                >
                  Subtask
                </th>
                <th
                  className="hidden px-4 text-left font-semibold text-[var(--color-text-primary)] sm:table-cell"
                  style={{ background: analyticsHeaderBg }}
                >
                  Department
                </th>
                <th
                  className="hidden px-4 text-left font-semibold text-[var(--color-text-primary)] md:table-cell"
                  style={{ background: analyticsHeaderBg }}
                >
                  Assigned To
                </th>
                <th className="px-4 text-center" style={{ background: analyticsHeaderBg }}>
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <span className="whitespace-nowrap font-semibold text-[var(--color-text-primary)]">
                      Avg. Duration
                    </span>
                    <div className="flex items-center justify-center gap-0.5">
                      <InstantTooltip
                        content="Slowest first"
                        compact
                        placement="above"
                        preventPlacementFlip
                        className="inline-flex"
                      >
                        <button
                          type="button"
                          aria-label="Slowest first"
                          onClick={() => setSortMode('desc')}
                          className={sortControlBtnClass}
                          style={{
                            color: sortMode === 'desc' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                            background:
                              sortMode === 'desc'
                                ? 'rgba(var(--color-accent-rgb,52,120,196),0.12)'
                                : 'transparent',
                          }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </InstantTooltip>
                      <InstantTooltip
                        content="Fastest first"
                        compact
                        placement="above"
                        preventPlacementFlip
                        className="inline-flex"
                      >
                        <button
                          type="button"
                          aria-label="Fastest first"
                          onClick={() => setSortMode('asc')}
                          className={sortControlBtnClass}
                          style={{
                            color: sortMode === 'asc' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                            background:
                              sortMode === 'asc'
                                ? 'rgba(var(--color-accent-rgb,52,120,196),0.12)'
                                : 'transparent',
                          }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                      </InstantTooltip>
                      <InstantTooltip
                        content="Reset to default"
                        compact
                        placement="above"
                        preventPlacementFlip
                        className="inline-flex"
                      >
                        <button
                          type="button"
                          aria-label="Reset to default"
                          aria-disabled={sortMode === 'template'}
                          tabIndex={sortMode === 'template' ? -1 : 0}
                          onClick={() => {
                            if (sortMode === 'template') return;
                            setSortMode('template');
                          }}
                          className={`${sortControlBtnClass} ${sortMode === 'template' ? 'cursor-not-allowed' : ''}`}
                          style={{
                            color: 'var(--color-text-muted)',
                            opacity: sortMode === 'template' ? 0.35 : 1,
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      </InstantTooltip>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSubtasks.map((row, rowIdx) => (
                <tr
                  key={row.subtaskTemplateId}
                  className="transition-colors hover:bg-[var(--color-bg-surface-raised)]"
                  style={{
                    borderBottom:
                      rowIdx < sortedSubtasks.length - 1
                        ? '1px solid var(--color-border-default)'
                        : undefined,
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                        style={{
                          background: 'rgba(var(--color-accent-rgb,52,120,196),0.12)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {subtaskStepNumberById.get(row.subtaskTemplateId) ?? '—'}
                      </span>
                      <span className="font-medium leading-snug text-[var(--color-text-primary)]">
                        {row.title}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className={departmentCapsuleClassName(row.departmentName)}>
                      {row.departmentName}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-[var(--color-text-secondary)] md:table-cell">
                    {row.assignedUserName ?? (
                      <span className="italic text-[var(--color-text-muted)]">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className="text-sm font-semibold"
                        style={{
                          color:
                            row.avgDurationHours == null
                              ? 'var(--color-text-muted)'
                              : 'var(--color-accent)',
                        }}
                      >
                        {formatWorkflowAnalyticsHours(row.avgDurationHours)}
                      </span>
                      {row.completedCount > 0 && (
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {row.completedCount} run{row.completedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export type WorkflowAnalyticsPanelProps = {
  /** Which template’s subtask timing table to show (driven by main templates table selection). */
  selectedTemplateId: string;
  /** Shown as the subtask section heading (analytics name, else template name). */
  subtaskSectionTitle: string;
  /** While analytics summary is loading, subtask card shows loading too. */
  analyticsLoading: boolean;
};

/**
 * Per-template subtask timing (summary metrics are on the Workflow Templates table above).
 */
export function WorkflowAnalyticsPanel({
  selectedTemplateId,
  subtaskSectionTitle,
  analyticsLoading,
}: WorkflowAnalyticsPanelProps) {
  return (
    <div id="workflow-analytics" className="mx-auto w-full max-w-7xl space-y-8 pt-8">
      <section className="min-w-0 w-full">
        <div className="mb-3">
          <h2
            className="text-lg font-semibold text-[var(--color-text-primary)]"
            title={subtaskSectionTitle || undefined}
          >
            {subtaskSectionTitle ? (
              <span className="line-clamp-2 break-words">{subtaskSectionTitle}</span>
            ) : (
              <span className="text-[var(--color-text-muted)]">Subtask timing</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Average completion time per subtask
          </p>
        </div>
        <SubtaskTimingCard
          key={selectedTemplateId || 'none'}
          templateId={selectedTemplateId}
          templatesLoading={analyticsLoading}
        />
      </section>
    </div>
  );
}
