'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { adminApi, workflowTemplatesApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

export default function NewWorkflowTemplatePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ticketClassId, setTicketClassId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [supportTopicId, setSupportTopicId] = useState('');
  const [maintenanceCategoryId, setMaintenanceCategoryId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const { data: taxonomyRes, isLoading: taxonomyLoading } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;

  const mutation = useMutation({
    mutationFn: () =>
      workflowTemplatesApi.create({
        ticketClassId,
        departmentId: ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'SUPPORT' ? departmentId || undefined : undefined,
        supportTopicId: ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'SUPPORT' ? supportTopicId || undefined : undefined,
        maintenanceCategoryId: ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'MAINTENANCE' ? maintenanceCategoryId || undefined : undefined,
        name: name.trim() || undefined,
      }),
    onSuccess: async (res) => {
      const id = res?.data?.id;
      if (!id) {
        setError('Template created but response did not include an id.');
        return;
      }
      await qc.refetchQueries({ queryKey: ['workflow-templates'] });
      router.push(`/admin/workflow-templates/${id}`);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Failed to create template.');
    },
  });

  const ticketClasses = taxonomy?.ticketClasses ?? [];
  const supportDepts = taxonomy?.supportTopicsByDepartment ?? [];
  const selectedDeptTopics = supportDepts.find((d) => d.id === departmentId)?.topics ?? [];
  const maintenanceCategories = taxonomy?.maintenanceCategories ?? [];
  const isSupport = ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'SUPPORT';
  const isMaintenance = ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'MAINTENANCE';
  const canSubmit =
    ticketClassId &&
    (isSupport ? departmentId && supportTopicId : isMaintenance ? maintenanceCategoryId : false);

  if (taxonomyLoading || !taxonomy) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
        <Header title="New workflow template" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="New workflow template" />
      <div className="flex-1 p-6 max-w-xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="dashboard-card rounded-xl p-6 space-y-4" style={panel}>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Select ticket context</h2>
          <ComboBox
            label="Ticket type"
            placeholder="— Select type —"
            options={ticketClasses.map((c) => ({ value: c.id, label: c.name }))}
            value={ticketClassId}
            onChange={(v) => {
              setTicketClassId(v);
              setDepartmentId('');
              setSupportTopicId('');
              setMaintenanceCategoryId('');
            }}
          />
          {isSupport && (
            <>
              <ComboBox
                label="Department"
                placeholder="— Select department —"
                options={supportDepts.map((d) => ({ value: d.id, label: d.name }))}
                value={departmentId}
                onChange={(v) => { setDepartmentId(v); setSupportTopicId(''); }}
              />
              {departmentId && (
                <ComboBox
                  label="Support topic"
                  placeholder="— Select topic —"
                  options={selectedDeptTopics.map((t) => ({ value: t.id, label: t.name }))}
                  value={supportTopicId}
                  onChange={setSupportTopicId}
                />
              )}
            </>
          )}
          {isMaintenance && (
            <ComboBox
              label="Maintenance category"
              placeholder="— Select category —"
              options={maintenanceCategories.map((c) => ({ value: c.id, label: c.name }))}
              value={maintenanceCategoryId}
              onChange={setMaintenanceCategoryId}
            />
          )}
          <Input
            label="Template name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. New Hire Checklist"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit} loading={mutation.isPending}>
              Create template
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
