'use client';

import { useState, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import {
  workflowAnalyticsApi,
  type WorkflowTemplateAnalyticsRow,
  type WorkflowDepartmentMetricsRow,
  type WorkflowBottlenecksResponse,
  type WorkflowSubtaskTimingRow,
} from '@/lib/api';
import { Header } from '@/components/layout/Header';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

function formatHours(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

type SortMode = 'template' | 'asc' | 'desc';

function SubtaskTimingCard({
  templates,
  templatesLoading,
}: {
  templates: WorkflowTemplateAnalyticsRow[];
  templatesLoading: boolean;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('template');

  // Auto-select first template once templates load
  const effectiveTemplateId = selectedTemplateId || templates[0]?.templateId || '';

  const { data, isLoading } = useQuery({
    queryKey: ['workflow-analytics', 'subtask-timing', effectiveTemplateId],
    queryFn: () => workflowAnalyticsApi.getSubtaskTiming(effectiveTemplateId).then((r) => r.data),
    enabled: !!effectiveTemplateId,
  });

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
    // 'template' — original sortOrder
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [data?.subtasks, sortMode]);

  const loading = templatesLoading || isLoading;

  return (
    <div className="dashboard-card rounded-xl overflow-hidden flex flex-col" style={panel}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Subtask Timing by Workflow</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Average completion time per subtask step</p>
        </div>
        {/* Template dropdown */}
        <div className="shrink-0">
          {templatesLoading ? (
            <div className="h-8 w-48 rounded-lg animate-pulse" style={{ background: 'var(--color-bg-surface-raised)' }} />
          ) : templates.length === 0 ? null : (
            <select
              value={effectiveTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                setSortMode('template');
              }}
              className="h-8 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
              }}
            >
              {templates.map((t) => (
                <option key={t.templateId} value={t.templateId}>
                  {t.templateName ?? t.templateId}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
          <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
        </div>
      ) : !effectiveTemplateId || templates.length === 0 ? (
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
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border-default)',
                  background: 'var(--color-bg-content-header)',
                }}
              >
                <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">
                  Subtask
                </th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)] hidden sm:table-cell">
                  Department
                </th>
                <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)] hidden md:table-cell">
                  Assigned To
                </th>
                <th className="py-3 px-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="font-semibold text-[var(--color-text-primary)] whitespace-nowrap">
                      Avg. Duration
                    </span>
                    {/* Sort controls */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        title="Sort longest first"
                        onClick={() => setSortMode((m) => m === 'desc' ? 'template' : 'desc')}
                        className="rounded p-1 transition-colors"
                        style={{
                          color: sortMode === 'desc' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          background: sortMode === 'desc' ? 'rgba(var(--color-accent-rgb,52,120,196),0.12)' : 'transparent',
                        }}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Sort shortest first"
                        onClick={() => setSortMode((m) => m === 'asc' ? 'template' : 'asc')}
                        className="rounded p-1 transition-colors"
                        style={{
                          color: sortMode === 'asc' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                          background: sortMode === 'asc' ? 'rgba(var(--color-accent-rgb,52,120,196),0.12)' : 'transparent',
                        }}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      {sortMode !== 'template' && (
                        <button
                          type="button"
                          title="Reset to workflow order"
                          onClick={() => setSortMode('template')}
                          className="rounded p-1 transition-colors"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedSubtasks.map((row, idx) => (
                <tr
                  key={row.subtaskTemplateId}
                  className="hover:bg-[var(--color-bg-surface-raised)] transition-colors"
                  style={{
                    borderBottom:
                      idx < sortedSubtasks.length - 1
                        ? '1px solid var(--color-border-default)'
                        : undefined,
                  }}
                >
                  {/* Step number badge + title */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      {sortMode === 'template' && (
                        <span
                          className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-semibold"
                          style={{
                            background: 'rgba(var(--color-accent-rgb,52,120,196),0.12)',
                            color: 'var(--color-accent)',
                          }}
                        >
                          {idx + 1}
                        </span>
                      )}
                      <span className="text-[var(--color-text-primary)] font-medium leading-snug">
                        {row.title}
                      </span>
                    </div>
                  </td>
                  {/* Department */}
                  <td className="py-3 px-4 hidden sm:table-cell">
                    <span
                      className="inline-block text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: 'var(--color-bg-surface-raised)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-default)',
                      }}
                    >
                      {row.departmentName}
                    </span>
                  </td>
                  {/* Assigned user */}
                  <td className="py-3 px-4 hidden md:table-cell text-[var(--color-text-secondary)] text-sm">
                    {row.assignedUserName ?? (
                      <span className="text-[var(--color-text-muted)] italic">Unassigned</span>
                    )}
                  </td>
                  {/* Avg duration */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span
                        className="font-semibold text-sm"
                        style={{
                          color:
                            row.avgDurationHours == null
                              ? 'var(--color-text-muted)'
                              : 'var(--color-accent)',
                        }}
                      >
                        {formatHours(row.avgDurationHours)}
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

export default function AdminWorkflowAnalyticsPage() {
  const [templatesQuery, departmentsQuery, bottlenecksQuery] = useQueries({
    queries: [
      {
        queryKey: ['workflow-analytics', 'templates'],
        queryFn: () => workflowAnalyticsApi.getTemplates().then((r) => r.data),
      },
      {
        queryKey: ['workflow-analytics', 'departments'],
        queryFn: () => workflowAnalyticsApi.getDepartments().then((r) => r.data),
      },
      {
        queryKey: ['workflow-analytics', 'bottlenecks'],
        queryFn: () => workflowAnalyticsApi.getBottlenecks().then((r) => r.data),
      },
    ],
  });

  const templates = (templatesQuery.data ?? []) as WorkflowTemplateAnalyticsRow[];
  const departments = (departmentsQuery.data ?? []) as WorkflowDepartmentMetricsRow[];

  const loading = templatesQuery.isLoading || departmentsQuery.isLoading || bottlenecksQuery.isLoading;
  const error = templatesQuery.error || departmentsQuery.error || bottlenecksQuery.error;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Workflow Analytics" />
      <div className="p-6 max-w-5xl space-y-8">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-800">
            Failed to load analytics. You may need admin access.
          </div>
        )}

        {/* Workflow Template Analytics */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Workflow Template Analytics</h2>
          <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">Template</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Total</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Active</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Completed</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Avg completion</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--color-text-muted)]">
                        No workflow templates with executions yet.
                      </td>
                    </tr>
                  ) : (
                    templates.map((row) => (
                      <tr key={row.templateId} className="hover:bg-[var(--color-bg-surface)]" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                        <td className="py-3 px-4 text-[var(--color-text-primary)]">{row.templateName ?? row.templateId}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.totalExecutions}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.activeExecutions}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.completedExecutions}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-secondary)]">{formatHours(row.avgCompletionTimeHours)}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-secondary)]">{formatDate(row.mostRecentExecutionAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Department Workflow Metrics */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Department Workflow Metrics</h2>
          <div className="dashboard-card rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-content-header)' }}>
                    <th className="text-left py-3 px-4 font-semibold text-[var(--color-text-primary)]">Department</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Tickets created</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Workflows started</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Workflows completed</th>
                    <th className="text-right py-3 px-4 font-semibold text-[var(--color-text-primary)]">Avg duration</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--color-text-muted)]">
                        No departments with ticket data.
                      </td>
                    </tr>
                  ) : (
                    departments.map((row) => (
                      <tr key={row.departmentId} className="hover:bg-[var(--color-bg-surface)]" style={{ borderBottom: '1px solid var(--color-border-default)' }}>
                        <td className="py-3 px-4 text-[var(--color-text-primary)]">{row.departmentName}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.ticketsCreated}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.workflowsStarted}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-primary)]">{row.workflowsCompleted}</td>
                        <td className="py-3 px-4 text-right text-[var(--color-text-secondary)]">{formatHours(row.avgWorkflowDurationHours)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Subtask Timing — per-template dashboard card */}
        <section>
          <SubtaskTimingCard
            templates={templates}
            templatesLoading={templatesQuery.isLoading}
          />
        </section>
      </div>
    </div>
  );
}
