'use client';

import { useQueries } from '@tanstack/react-query';
import {
  workflowAnalyticsApi,
  type WorkflowTemplateAnalyticsRow,
  type WorkflowDepartmentMetricsRow,
  type WorkflowBottlenecksResponse,
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
  const bottlenecks = (bottlenecksQuery.data ?? {
    longestSubtasks: [],
  }) as WorkflowBottlenecksResponse;

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
          <div className="rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface-raised)' }}>
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
          <div className="rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface-raised)' }}>
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

        {/* Workflow Bottlenecks */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-3">Longest-running subtask types</h2>
            <div className="rounded-xl overflow-hidden" style={panel}>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                  <span className="text-sm text-[var(--color-text-muted)]">Loading…</span>
                </div>
              ) : bottlenecks.longestSubtasks.length === 0 ? (
                <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">No completed subtasks to rank.</div>
              ) : (
                <ul className="divide-y">
                  {bottlenecks.longestSubtasks.map((item) => (
                    <li key={item.subtaskTemplateId} className="flex justify-between items-center py-3 px-4 hover:bg-[var(--color-bg-surface)]">
                      <span className="text-[var(--color-text-primary)] truncate pr-2">{item.title || item.subtaskTemplateId}</span>
                      <span className="text-[var(--color-accent)] shrink-0 font-medium">{formatHours(item.avgDurationHours)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
