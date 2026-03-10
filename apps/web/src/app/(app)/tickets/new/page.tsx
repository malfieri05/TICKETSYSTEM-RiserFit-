'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ticketsApi, adminApi, ticketFormsApi, invalidateTicketLists } from '@/lib/api';
import type {
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
  const qc = useQueryClient();
  const { user } = useAuth();

  const [ticketClassId, setTicketClassId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [supportTopicId, setSupportTopicId] = useState<string>('');
  const [maintenanceCategoryId, setMaintenanceCategoryId] = useState<string>('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [studioId, setStudioId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formResponses, setFormResponses] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setSubmitterName((prev) => (prev === '' ? (user.displayName ?? '') : prev));
      setSubmitterEmail((prev) => (prev === '' ? (user.email ?? '') : prev));
      if (user.studioId && !studioId) setStudioId(user.studioId);
    }
  }, [user]);

  const { data: taxonomyRes, isLoading: taxonomyLoading } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;

  const { data: marketsRes } = useQuery({
    queryKey: ['admin-markets'],
    queryFn: () => adminApi.listMarkets(),
  });
  const studiosList = useMemo(() => {
    const markets = (marketsRes?.data ?? []) as Array<{ id: string; name: string; studios?: { id: string; name: string }[] }>;
    return markets.flatMap((m) => (m.studios ?? []).map((s) => ({ ...s, marketName: m.name })));
  }, [marketsRes?.data]);

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

  const mutation = useMutation({
    mutationFn: (payload: CreateTicketPayload) => ticketsApi.create(payload),
    onSuccess: (res) => {
      invalidateTicketLists(qc);
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

  const hasSchemaFields = schema?.fields && visibleFields.length > 0;
  const useFallbackFields = contextReady && !hasSchemaFields;

  const topicLabel = useMemo(() => {
    if (isSupport && supportTopicId) return selectedDeptTopics.find((t) => t.id === supportTopicId)?.name ?? schema?.name ?? 'Support';
    if (isMaintenance && maintenanceCategoryId) return maintenanceCategories.find((c) => c.id === maintenanceCategoryId)?.name ?? schema?.name ?? 'Maintenance';
    return null;
  }, [isSupport, isMaintenance, supportTopicId, maintenanceCategoryId, selectedDeptTopics, maintenanceCategories, schema?.name]);

  const studioName = useMemo(
    () => studiosList.find((s) => s.id === studioId)?.name ?? null,
    [studiosList, studioId],
  );

  /** Stage 21: preview mirrors backend title-generator logic; backend remains source of truth. */
  function deriveTitlePreview(): string {
    if (!topicLabel) return '';
    const r = (key: string) => (formResponses[key] ?? '').trim();
    const loc = studioName?.trim() || null;
    const seg = (parts: (string | null | undefined)[]) =>
      parts.filter((p) => p != null && String(p).trim() !== '').join(' – ');

    if (isMaintenance) {
      const shortCategory = topicLabel.split('/')[0].trim() || 'Maintenance';
      const issue = r('issue');
      const parts: (string | null)[] = [shortCategory + ' Issue'];
      if (loc) parts.push(loc);
      if (issue) parts.push(issue.length > 40 ? issue.slice(0, 37) + '...' : issue);
      return seg(parts) || shortCategory + ' Issue';
    }

    const first = r('legal_first_name');
    const last = r('legal_last_name');
    const fullName = [first, last].filter(Boolean).join(' ').trim() || null;

    switch (topicLabel) {
      case 'New Hire':
        return seg([topicLabel, fullName || 'Submission', loc]) || topicLabel + ' – Submission';
      case 'Resignation / Termination':
        return seg(['Resignation', fullName || 'Submission', loc]) || 'Resignation – Submission';
      case 'PAN / Change in Relationship':
        return seg(['PAN', fullName || 'Submission', loc]) || 'PAN – Submission';
      case 'New Job Posting':
        return seg([topicLabel, r('position') || 'Request', loc]) || topicLabel + ' – Request';
      case 'Workshop Bonus':
        return seg([topicLabel, r('name') || 'Submission', loc]) || topicLabel + ' – Submission';
      case 'Paycom':
        return seg([topicLabel, loc]) || topicLabel + ' – Request';
      default:
        break;
    }

    const identifying =
      fullName ||
      r('full_legal_name') ||
      r('short_description') ||
      r('general_support') ||
      r('instructor_cr_id') ||
      r('current_name_new_name_location') ||
      r('retail_request') ||
      r('brand_style_size') ||
      r('which_locations') ||
      r('more_details') ||
      r('ship_to_location') ||
      r('cases_needed');
    const primary = identifying ? (identifying.length > 45 ? identifying.slice(0, 42) + '...' : identifying) : null;
    return seg([topicLabel, primary || 'Request', loc]) || topicLabel + ' – Submission';
  }

  const titlePreview = useMemo(
    () => (hasSchemaFields ? deriveTitlePreview() : ''),
    [hasSchemaFields, topicLabel, isMaintenance, formResponses, studioName],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!submitterName.trim()) {
      setError('Submitter full name is required.');
      return;
    }
    if (!submitterEmail.trim()) {
      setError('Work email is required.');
      return;
    }
    if (useFallbackFields && !title.trim()) {
      setError('Summary is required.');
      return;
    }
    if (missingRequired) {
      setError('Please fill in all required fields.');
      return;
    }

    const resolvedTitle = hasSchemaFields ? '' : title.trim();
    const resolvedDescription = hasSchemaFields ? (formResponses['additional_details'] ?? '').trim() || undefined : description.trim() || undefined;

    const payload: CreateTicketPayload = {
      ...(resolvedTitle !== '' && { title: resolvedTitle }),
      description: resolvedDescription,
      priority: 'MEDIUM',
      ticketClassId,
    };
    if (isSupport && departmentId && supportTopicId) {
      payload.departmentId = departmentId;
      payload.supportTopicId = supportTopicId;
    }
    if (isMaintenance && maintenanceCategoryId) {
      payload.maintenanceCategoryId = maintenanceCategoryId;
    }
    if (studioId) payload.studioId = studioId;
    if (Object.keys(formResponses).length > 0) {
      payload.formResponses = { ...formResponses };
    }
    mutation.mutate(payload);
  };

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
                  label="Topic"
                  value={supportTopicId}
                  onChange={(e) => {
                    setSupportTopicId(e.target.value);
                    setFormResponses({});
                  }}
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
              onChange={(e) => {
                setMaintenanceCategoryId(e.target.value);
                setFormResponses({});
              }}
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

          {/* When context ready: standard top + taxonomy already above; then schema-driven or fallback */}
          {contextReady && (
            <>
              <div className="space-y-4 pt-2" style={{ borderTop: '1px solid #2a2a2a' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#555555' }}>Your information</p>
                <Input
                  id="submitterName"
                  label="Submitter full name"
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  required
                />
                <Input
                  id="submitterEmail"
                  label="Work email"
                  type="email"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  required
                />
                <Select
                  id="studioId"
                  label="Employee / hiring location"
                  value={studioId}
                  onChange={(e) => setStudioId(e.target.value)}
                >
                  <option value="">— Select location —</option>
                  {studiosList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.marketName ? ` (${s.marketName})` : ''}</option>
                  ))}
                </Select>
              </div>

              {hasSchemaFields && (
                <>
                  <div className="space-y-4" style={{ borderTop: '1px solid #2a2a2a' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide pt-4" style={{ color: '#555555' }}>{topicLabel} — form</p>
                    <p className="text-xs" style={{ color: '#666666' }}>* required fields</p>
                    {visibleFields.map((field, index) => {
                      const prevSection = index > 0 ? visibleFields[index - 1].section : undefined;
                      const showSectionHeader = field.section && field.section !== prevSection;
                      return (
                        <div key={field.id} className="space-y-2">
                          {showSectionHeader && (
                            <p className="text-sm font-semibold text-gray-300 pt-2 first:pt-0" style={{ borderTop: index > 0 ? '1px solid #2a2a2a' : undefined, paddingTop: index > 0 ? 8 : 0 }}>
                              {field.section}
                            </p>
                          )}
                          <DynamicField
                            field={field}
                            value={formResponses[field.fieldKey] ?? ''}
                            onChange={(value) => setFormResponses((prev) => ({ ...prev, [field.fieldKey]: value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(20,20,20,0.6)', border: '1px solid #2a2a2a' }}>
                    <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: '#666666' }}>Ticket title preview</p>
                    <p className="text-sm text-gray-300" style={{ minHeight: '1.25rem' }}>{titlePreview || '—'}</p>
                  </div>
                </>
              )}

              {useFallbackFields && (
                <>
                  <Input
                    id="title"
                    label="Summary"
                    placeholder="Brief summary of the issue"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                  <Textarea
                    id="description"
                    label="Additional notes (optional)"
                    placeholder="Provide additional details..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </>
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
  const displayLabel = field.required ? `${field.label} *` : field.label;

  if (field.type === 'textarea') {
    return (
      <Textarea
        id={id}
        label={displayLabel}
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
        label={displayLabel}
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
        <label className="text-sm font-medium text-gray-300">{displayLabel}</label>
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
        label={displayLabel}
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
      label={displayLabel}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
      placeholder={field.type === 'text' ? undefined : ''}
    />
  );
}
