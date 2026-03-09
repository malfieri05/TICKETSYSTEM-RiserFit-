'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { workflowTemplatesApi } from '@/lib/api';
import type { WorkflowTemplateListItemDto } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

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
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
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
        <div className="rounded-xl overflow-hidden" style={panel}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="animate-spin h-6 w-6 rounded-full border-4 border-teal-500 border-t-transparent" />
              <span className="text-sm text-gray-500">Loading…</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: '#555555' }}>
              <p className="text-sm font-medium text-gray-300">No workflow templates yet</p>
              <p className="text-xs text-center max-w-sm">Create a template to define subtask workflows for ticket types and categories.</p>
              <Button size="sm" onClick={() => router.push('/admin/workflow-templates/new')}>
                <Plus className="h-4 w-4" />
                New workflow template
              </Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a2a', background: '#141414' }}>
                  <th className="text-left py-3 px-4 font-semibold text-gray-300">Context</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-300">Subtasks</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-300">Status</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[#2a2a2a] hover:bg-[#222]"
                  >
                    <td className="py-3 px-4 text-gray-200">{contextLabel(t)}</td>
                    <td className="py-3 px-4 text-gray-400">{t._count?.subtaskTemplates ?? 0}</td>
                    <td className="py-3 px-4">
                      <span className={t.isActive ? 'text-teal-400' : 'text-gray-500'}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/admin/workflow-templates/${t.id}`}
                        className="text-teal-400 hover:text-teal-300 text-sm font-medium"
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
