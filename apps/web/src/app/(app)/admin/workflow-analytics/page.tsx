'use client';

import { useQueries } from '@tanstack/react-query';
import {
  workflowAnalyticsApi,
  type WorkflowTemplateAnalyticsRow,
  type WorkflowDepartmentMetricsRow,
  type WorkflowBottlenecksResponse,
} from '@/lib/api';
import { Header } from '@/components/layout/Header';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

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
    mostBlockedSubtasks: [],
  }) as WorkflowBottlenecksResponse;

  const loading = templatesQuery.isLoading || departmentsQuery.isLoading || bottlenecksQuery.isLoading;
  const error = templatesQuery.error || departmentsQuery.error || bottlenecksQuery.error;

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="Workflow Analytics" />
      <div className="p-6 max-w-5xl space-y-8">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-800">
            Failed to load analytics. You may need admin access.
          </div>
        )}

        {/* Workflow Template Analytics */}
        <section>
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Workflow Template Analytics</h2>
          <div className="rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                    <th className="text-left py-3 px-4 font-semibold text-gray-300">Template</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Total</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Active</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Completed</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Avg completion</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Last run</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No workflow templates with executions yet.
                      </td>
                    </tr>
                  ) : (
                    templates.map((row) => (
                      <tr key={row.templateId} className="border-b border-[#2a2a2a] hover:bg-[#222]">
                        <td className="py-3 px-4 text-gray-200">{row.templateName ?? row.templateId}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.totalExecutions}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.activeExecutions}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.completedExecutions}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{formatHours(row.avgCompletionTimeHours)}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{formatDate(row.mostRecentExecutionAt)}</td>
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
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Department Workflow Metrics</h2>
          <div className="rounded-xl overflow-hidden" style={panel}>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                    <th className="text-left py-3 px-4 font-semibold text-gray-300">Department</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Tickets created</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Workflows started</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Workflows completed</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-300">Avg duration</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No departments with ticket data.
                      </td>
                    </tr>
                  ) : (
                    departments.map((row) => (
                      <tr key={row.departmentId} className="border-b border-[#2a2a2a] hover:bg-[#222]">
                        <td className="py-3 px-4 text-gray-200">{row.departmentName}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.ticketsCreated}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.workflowsStarted}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{row.workflowsCompleted}</td>
                        <td className="py-3 px-4 text-right text-gray-400">{formatHours(row.avgWorkflowDurationHours)}</td>
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
            <h2 className="text-lg font-semibold text-gray-200 mb-3">Longest-running subtask types</h2>
            <div className="rounded-xl overflow-hidden" style={panel}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
                </div>
              ) : bottlenecks.longestSubtasks.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">No completed subtasks to rank.</div>
              ) : (
                <ul className="divide-y divide-[#2a2a2a]">
                  {bottlenecks.longestSubtasks.map((item) => (
                    <li key={item.subtaskTemplateId} className="flex justify-between items-center py-3 px-4 hover:bg-[#222]">
                      <span className="text-gray-300 truncate pr-2">{item.title || item.subtaskTemplateId}</span>
                      <span className="text-teal-400 shrink-0 font-medium">{formatHours(item.avgDurationHours)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-200 mb-3">Most blocked subtask types</h2>
            <div className="rounded-xl overflow-hidden" style={panel}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
                </div>
              ) : bottlenecks.mostBlockedSubtasks.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">No blocked subtasks.</div>
              ) : (
                <ul className="divide-y divide-[#2a2a2a]">
                  {bottlenecks.mostBlockedSubtasks.map((item) => (
                    <li key={item.subtaskTemplateId} className="flex justify-between items-center py-3 px-4 hover:bg-[#222]">
                      <span className="text-gray-300 truncate pr-2">{item.title || item.subtaskTemplateId}</span>
                      <span className="text-amber-400 shrink-0 font-medium">{item.blockedCount}</span>
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
