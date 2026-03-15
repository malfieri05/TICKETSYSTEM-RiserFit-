'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { ticketsApi, adminApi, ticketFormsApi, attachmentsApi, invalidateTicketLists } from '@/lib/api';
import type {
  TicketFormSchemaDto,
  FormFieldDto,
  CreateTicketPayload,
} from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { useAuth } from '@/hooks/useAuth';
import { UploadDropzone } from '@/components/uploads/UploadDropzone';

const panel = { background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' };

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
  const [stagedFiles, setStagedFiles] = useState<{ id: string; file: File }[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

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
    queryKey: ['markets'],
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
    onSuccess: () => {
      invalidateTicketLists(qc);
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

  const allowAttachmentsOnCreate = isSupport || isMaintenance;

  const handleStagedFilesSelected = (files: File[]) => {
    setStagedFiles((prev) => [
      ...prev,
      ...files.map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`, file })),
    ]);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
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

    try {
      const res = await mutation.mutateAsync(payload);
      const ticketId = res.data.id;

      qc.prefetchQuery({ queryKey: ['ticket', ticketId], queryFn: () => ticketsApi.get(ticketId) });

      if (stagedFiles.length > 0) {
        setUploadingAttachments(true);
        try {
          const failedUploads: string[] = [];
          for (const { file } of stagedFiles) {
            try {
              const { data } = await attachmentsApi.requestUploadUrl(ticketId, {
                filename: file.name,
                mimeType: file.type || 'application/octet-stream',
                sizeBytes: file.size,
              });
              try {
                await attachmentsApi.uploadToS3(data.uploadUrl, file);
              } catch (err) {
                failedUploads.push(file.name);
                // eslint-disable-next-line no-console
                console.error('Attachment upload failed at s3-put stage:', file.name, err);
                continue;
              }
              try {
                await attachmentsApi.confirmUpload(ticketId, {
                  s3Key: data.s3Key,
                  filename: file.name,
                  mimeType: file.type || 'application/octet-stream',
                  sizeBytes: file.size,
                });
              } catch (err) {
                failedUploads.push(file.name);
                // eslint-disable-next-line no-console
                console.error('Attachment upload failed at confirm stage:', file.name, err);
              }
            } catch (err) {
              failedUploads.push(file.name);
              // Non-fatal: log for debugging while keeping ticket creation independent
              // eslint-disable-next-line no-console
              console.error('Attachment upload failed at upload-url stage:', file.name, err);
            }
          }
          if (failedUploads.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
              'Some attachments failed to upload:',
              failedUploads.join(', '),
            );
          }
        } finally {
          setUploadingAttachments(false);
        }
      }

      setStagedFiles([]);
      router.push(`/tickets/${ticketId}`);
    } catch {
      // error already handled in mutation onError
    }
  };

  if (taxonomyLoading || !taxonomy) {
    return (
      <div className="flex flex-col h-full">
        <Header title="New Ticket" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
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
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Create a new ticket</h2>

          {/* 1. Ticket class */}
          <ComboBox
            id="ticketClass"
            label="Ticket type"
            placeholder="— Select type —"
            options={ticketClasses.map((c) => ({ value: c.id, label: c.name }))}
            value={ticketClassId}
            onChange={(v) => {
              setTicketClassId(v);
              setDepartmentId('');
              setSupportTopicId('');
              setMaintenanceCategoryId('');
              setFormResponses({});
            }}
          />

          {/* 2a. SUPPORT: department → support topic */}
          {isSupport && (
            <>
              <ComboBox
                id="department"
                label="Department"
                placeholder="— Select department —"
                options={supportDepts.map((d) => ({ value: d.id, label: d.name }))}
                value={departmentId}
                onChange={(v) => {
                  setDepartmentId(v);
                  setSupportTopicId('');
                }}
              />
              {departmentId && (
                <ComboBox
                  id="supportTopic"
                  label="Topic"
                  placeholder="— Select topic —"
                  options={selectedDeptTopics.map((t) => ({ value: t.id, label: t.name }))}
                  value={supportTopicId}
                  onChange={(v) => {
                    setSupportTopicId(v);
                    setFormResponses({});
                  }}
                />
              )}
            </>
          )}

          {/* 2b. MAINTENANCE: maintenance category */}
          {isMaintenance && (
            <ComboBox
              id="maintenanceCategory"
              label="Maintenance category"
              placeholder="— Select category —"
              options={maintenanceCategories.map((c) => ({ value: c.id, label: c.name }))}
              value={maintenanceCategoryId}
              onChange={(v) => {
                setMaintenanceCategoryId(v);
                setFormResponses({});
              }}
            />
          )}

          {/* Schema loading / error */}
          {schemaParams && schemaLoading && (
            <p className="text-sm text-[var(--color-text-secondary)]">Loading form...</p>
          )}
          {schemaParams && schemaError && !schemaRes && (
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)' }}>
              <p className="text-sm text-amber-200">No form schema for this type. You can submit with title and description below.</p>
            </div>
          )}

          {/* When context ready: standard top + taxonomy already above; then schema-driven or fallback */}
          {contextReady && (
            <>
              <div className="space-y-4 pt-2" style={{ borderTop: '1px solid var(--color-border-default)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Your information</p>
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
                <ComboBox
                  id="studioId"
                  label="Employee / hiring location"
                  placeholder="— Select location —"
                  options={studiosList.map((s) => ({ value: s.id, label: `${s.name}${s.marketName ? ` (${s.marketName})` : ''}` }))}
                  value={studioId}
                  onChange={setStudioId}
                />
              </div>

              {hasSchemaFields && (
                <>
                  <div className="space-y-4" style={{ borderTop: '1px solid var(--color-border-default)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide pt-4" style={{ color: 'var(--color-text-muted)' }}>{topicLabel} — form</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>* required fields</p>
                    {visibleFields.map((field, index) => {
                      const prevSection = index > 0 ? visibleFields[index - 1].section : undefined;
                      const showSectionHeader = field.section && field.section !== prevSection;
                      return (
                        <div key={field.id} className="space-y-2">
                          {showSectionHeader && (
                            <p className="text-sm font-semibold text-[var(--color-text-primary)] pt-2 first:pt-0" style={{ borderTop: index > 0 ? '1px solid var(--color-border-default)' : undefined, paddingTop: index > 0 ? 8 : 0 }}>
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
                  <div className="rounded-lg px-3 py-2" style={{ background: 'var(--color-bg-surface-inset)', border: '1px solid var(--color-border-default)' }}>
                    <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>Ticket title preview</p>
                    <p className="text-sm text-[var(--color-text-primary)]" style={{ minHeight: '1.25rem' }}>{titlePreview || '—'}</p>
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

              {allowAttachmentsOnCreate && (
                <div className="space-y-3 pt-2" style={{ borderTop: '1px solid var(--color-border-default)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    Attachments (optional)
                  </p>
                  <UploadDropzone
                    label="Upload files"
                    description="Attach images, PDFs or documents. Files are uploaded after the ticket is created. Max 25MB per file."
                    multiple
                    onFilesSelected={handleStagedFilesSelected}
                  />
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Attachments are uploaded after the ticket is created. If an upload fails you can retry from the ticket page.
                  </p>
                  {stagedFiles.length > 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--color-border-default)] divide-y divide-gray-800">
                      {stagedFiles.map(({ id, file }) => {
                        const isImage = file.type.startsWith('image/');
                        const isPdf = file.type === 'application/pdf';
                        return (
                          <div key={id} className="flex items-center gap-3 px-3 py-2">
                            {isImage && (
                              <div className="h-10 w-10 rounded-md overflow-hidden border border-[var(--color-border-default)] shrink-0">
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={file.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}
                            {!isImage && (
                              <div className="h-8 w-8 rounded-md flex items-center justify-center border border-[var(--color-border-default)] text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                {isPdf ? 'PDF' : 'FILE'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-[var(--color-text-primary)]">
                                {file.name}
                              </p>
                              <p className="text-xs text-[var(--color-text-secondary)]">
                                {formatBytes(file.size)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setStagedFiles((prev) => prev.filter((f) => f.id !== id))
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {uploadingAttachments && (
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Uploading attachments after ticket creation…
                    </p>
                  )}
                </div>
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
            <p className="text-sm text-[var(--color-text-muted)]">Select all options above to continue.</p>
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
        <label className="text-sm font-medium text-[var(--color-text-primary)]">{displayLabel}</label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true' || value === 'yes'}
            onChange={(e) => onChange(e.target.checked ? 'true' : '')}
            className="rounded border-gray-500 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
            style={{ background: 'var(--color-bg-surface)' }}
          />
          <span className="text-sm text-[var(--color-text-secondary)]">Yes</span>
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
