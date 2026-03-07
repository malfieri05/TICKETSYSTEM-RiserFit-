'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ticketsApi, usersApi, adminApi, ticketFormsApi } from '@/lib/api';
import type {
  TicketPriority,
  TicketFormSchemaDto,
  FormFieldDto,
  CreateTicketPayload,
} from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

const panel = { background: '#1a1a1a', border: '1px solid #2a2a2a' };

export default function NewTicketPage() {
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [ticketClassId, setTicketClassId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [supportTopicId, setSupportTopicId] = useState<string>('');
  const [maintenanceCategoryId, setMaintenanceCategoryId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [formResponses, setFormResponses] = useState<Record<string, string>>({});
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');

  const { data: taxonomyRes, isLoading: taxonomyLoading } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;

  const supportContextReady =
    ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'SUPPORT' && departmentId && supportTopicId;
  const maintenanceContextReady =
    ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'MAINTENANCE' && maintenanceCategoryId;

  const schemaParams = useMemo(() => {
    if (!ticketClassId) return null;
    const tc = taxonomy?.ticketClasses.find((c) => c.id === ticketClassId);
    if (tc?.code === 'SUPPORT' && departmentId && supportTopicId)
      return { ticketClassId, departmentId, supportTopicId };
    if (tc?.code === 'MAINTENANCE' && maintenanceCategoryId)
      return { ticketClassId, maintenanceCategoryId };
    return null;
  }, [ticketClassId, departmentId, supportTopicId, maintenanceCategoryId, taxonomy?.ticketClasses]);

  const { data: schemaRes, isLoading: schemaLoading, isError: schemaError } = useQuery({
    queryKey: ['ticket-form-schema', schemaParams],
    queryFn: () => ticketFormsApi.getSchema(schemaParams!),
    enabled: !!schemaParams,
    retry: false,
  });
  const schema: TicketFormSchemaDto | null = schemaRes?.data ?? null;

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER',
  });
  const agents = (usersData?.data ?? []).filter((u) => u.role === 'DEPARTMENT_USER' || u.role === 'ADMIN');

  const mutation = useMutation({
    mutationFn: (payload: CreateTicketPayload) => ticketsApi.create(payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      router.push(`/tickets/${res.data.id}`);
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Failed to create ticket. Please try again.');
    },
  });

  const ticketClasses = taxonomy?.ticketClasses ?? [];
  const supportDepts = taxonomy?.supportTopicsByDepartment ?? [];
  const selectedDeptTopics = supportDepts.find((d) => d.id === departmentId)?.topics ?? [];
  const maintenanceCategories = taxonomy?.maintenanceCategories ?? [];

  const isSupport = ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'SUPPORT';
  const isMaintenance = ticketClassId && taxonomy?.ticketClasses.find((c) => c.id === ticketClassId)?.code === 'MAINTENANCE';
  const contextReady = supportContextReady || maintenanceContextReady;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setError('');

    const payload: CreateTicketPayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      ticketClassId,
      ownerId: ownerId || undefined,
    };
    if (isSupport && departmentId && supportTopicId) {
      payload.departmentId = departmentId;
      payload.supportTopicId = supportTopicId;
    }
    if (isMaintenance && maintenanceCategoryId) {
      payload.maintenanceCategoryId = maintenanceCategoryId;
    }
    if (Object.keys(formResponses).length > 0) {
      payload.formResponses = formResponses;
    }
    mutation.mutate(payload);
  };

  function isFieldVisible(field: FormFieldDto): boolean {
    if (!field.conditionalFieldKey || field.conditionalValue == null) return true;
    const depValue = formResponses[field.conditionalFieldKey];
    return String(depValue ?? '') === String(field.conditionalValue);
  }

  const visibleFields = useMemo(() => {
    if (!schema?.fields) return [];
    return schema.fields.filter((f) => isFieldVisible(f)).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [schema?.fields, formResponses]);

  const requiredFieldKeys = useMemo(() => new Set(visibleFields.filter((f) => f.required).map((f) => f.fieldKey)), [visibleFields]);

  const missingRequired = useMemo(() => {
    for (const key of requiredFieldKeys) {
      const v = formResponses[key];
      if (v === undefined || v === null || String(v).trim() === '') return key;
    }
    return null;
  }, [requiredFieldKeys, formResponses]);

  if (taxonomyLoading || !taxonomy) {
    return (
      <div className="flex flex-col h-full">
        <Header title="New Ticket" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="New Ticket" />
      <div className="flex-1 p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <form onSubmit={handleSubmit} className="rounded-xl p-6 space-y-5" style={panel}>
          <h2 className="text-base font-semibold text-gray-100">Create a new ticket</h2>

          {/* 1. Ticket class */}
          <Select
            id="ticketClass"
            label="Ticket type"
            value={ticketClassId}
            onChange={(e) => {
              setTicketClassId(e.target.value);
              setDepartmentId('');
              setSupportTopicId('');
              setMaintenanceCategoryId('');
              setFormResponses({});
            }}
          >
            <option value="">— Select type —</option>
            {ticketClasses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          {/* 2a. SUPPORT: department → support topic */}
          {isSupport && (
            <>
              <Select
                id="department"
                label="Department"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setSupportTopicId('');
                }}
              >
                <option value="">— Select department —</option>
                {supportDepts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
              {departmentId && (
                <Select
                  id="supportTopic"
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

          {/* 2b. MAINTENANCE: maintenance category */}
          {isMaintenance && (
            <Select
              id="maintenanceCategory"
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

          {/* Schema loading / error */}
          {schemaParams && schemaLoading && (
            <p className="text-sm text-gray-400">Loading form...</p>
          )}
          {schemaParams && schemaError && !schemaRes && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <p className="text-sm text-amber-200">No form schema for this type. You can submit with title and description below.</p>
            </div>
          )}

          {/* Core fields + dynamic fields when context ready */}
          {contextReady && (
            <>
              <Input
                id="title"
                label="Title"
                placeholder="Brief summary of the issue"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Textarea
                id="description"
                label="Description (optional)"
                placeholder="Provide additional details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              <Select
                id="priority"
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>

              {/* Dynamic fields from schema */}
              {schema?.fields && visibleFields.map((field) => (
                <DynamicField
                  key={field.id}
                  field={field}
                  value={formResponses[field.fieldKey] ?? ''}
                  onChange={(value) => setFormResponses((prev) => ({ ...prev, [field.fieldKey]: value }))}
                />
              ))}

              {(user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER') && (
                <Select
                  id="owner"
                  label="Assign to (optional)"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.displayName}</option>
                  ))}
                </Select>
              )}

              {error && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
              {missingRequired && (
                <p className="text-sm text-amber-400">Please fill in all required fields.</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="submit"
                  loading={mutation.isPending}
                  disabled={!!missingRequired}
                >
                  Create Ticket
                </Button>
                <Button type="button" variant="secondary" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {!contextReady && ticketClassId && (
            <p className="text-sm text-gray-500">Select all options above to continue.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FormFieldDto;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `form-${field.fieldKey}`;
  const options = field.options ?? [];

  if (field.type === 'textarea') {
    return (
      <Textarea
        id={id}
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        required={field.required}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <Select
        id={id}
        label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      >
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-300">{field.label}</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true' || value === 'yes'}
            onChange={(e) => onChange(e.target.checked ? 'true' : '')}
            className="rounded border-gray-500 text-teal-500 focus:ring-teal-500"
            style={{ background: '#111111' }}
          />
          <span className="text-sm text-gray-400">Yes</span>
        </label>
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <Input
        id={id}
        label={field.label}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }

  return (
    <Input
      id={id}
      label={field.label}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      placeholder={field.type === 'text' ? undefined : ''}
    />
  );
}
