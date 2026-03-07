'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { adminApi, workflowTemplatesApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

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
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workflow-templates'] });
      router.push(`/admin/workflow-templates/${res.data.id}`);
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
      <div className="flex flex-col h-full" style={{ background: '#000000' }}>
        <Header title="New workflow template" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#000000' }}>
      <Header title="New workflow template" />
      <div className="flex-1 p-6 max-w-xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="rounded-xl p-6 space-y-4" style={panel}>
          <h2 className="text-base font-semibold text-gray-100">Select ticket context</h2>
          <Select
            label="Ticket type"
            value={ticketClassId}
            onChange={(e) => {
              setTicketClassId(e.target.value);
              setDepartmentId('');
              setSupportTopicId('');
              setMaintenanceCategoryId('');
            }}
          >
            <option value="">— Select type —</option>
            {ticketClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          {isSupport && (
            <>
              <Select
                label="Department"
                value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value); setSupportTopicId(''); }}
              >
                <option value="">— Select department —</option>
                {supportDepts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
              {departmentId && (
                <Select
                  label="Support topic"
                  value={supportTopicId}
                  onChange={(e) => setSupportTopicId(e.target.value)}
                >
                  <option value="">— Select topic —</option>
                  {selectedDeptTopics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              )}
            </>
          )}
          {isMaintenance && (
            <Select
              label="Maintenance category"
              value={maintenanceCategoryId}
              onChange={(e) => setMaintenanceCategoryId(e.target.value)}
            >
              <option value="">— Select category —</option>
              {maintenanceCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
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
