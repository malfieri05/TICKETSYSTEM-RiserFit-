'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, GripVertical, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';

/** Wrapper for collapsible section body: animates height via grid for smooth expand/collapse */
function CollapsibleBody({
  collapsed,
  children,
  className = '',
}: {
  collapsed: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out ${className}`}
      style={{ gridTemplateRows: collapsed ? '0fr' : '1fr' }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
import {
  workflowTemplatesApi,
  adminApi,
  usersApi,
} from '@/lib/api';
import type {
  WorkflowTemplateDetailDto,
  WorkflowTemplateSubtaskDto,
  WorkflowTemplateDependencyDto,
} from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ComboBox } from '@/components/ui/ComboBox';
import { UserSearchSelect } from '@/components/ui/UserSearchSelect';
import { cn } from '@/lib/utils';

const panel = { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' };

/** Client-side cycle check: would adding edge (fromId -> toId) create a path from toId back to fromId? */
function wouldCreateCycle(
  deps: { subtaskTemplateId: string; dependsOnSubtaskTemplateId: string }[],
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true;
  const outEdges = new Map<string, string[]>();
  for (const d of deps) {
    if (!outEdges.has(d.subtaskTemplateId)) outEdges.set(d.subtaskTemplateId, []);
    outEdges.get(d.subtaskTemplateId)!.push(d.dependsOnSubtaskTemplateId);
  }
  const reachable = new Set<string>();
  const stack: string[] = [toId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const next of outEdges.get(cur) ?? []) {
      if (!reachable.has(next)) stack.push(next);
    }
  }
  return reachable.has(fromId);
}

export default function WorkflowTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [addSubtaskTitle, setAddSubtaskTitle] = useState('');
  const [addSubtaskDescription, setAddSubtaskDescription] = useState('');
  const [addSubtaskDepartmentId, setAddSubtaskDepartmentId] = useState('');
  const [addSubtaskAssignedUserId, setAddSubtaskAssignedUserId] = useState('');
  const [depSubtaskId, setDepSubtaskId] = useState('');
  const [depDependsOnId, setDepDependsOnId] = useState('');
  const [error, setError] = useState('');
  const [editSubtaskId, setEditSubtaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editAssignedUserId, setEditAssignedUserId] = useState('');
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [confirmDeleteSubtaskId, setConfirmDeleteSubtaskId] = useState<string | null>(null);
  const [confirmRemoveDep, setConfirmRemoveDep] = useState<WorkflowTemplateDependencyDto | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  /** Collapsible “Add dependency” block under Add subtask (default collapsed). */
  const [addDepSectionCollapsed, setAddDepSectionCollapsed] = useState(true);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false);

  const { data: templateRes, isLoading } = useQuery({
    queryKey: ['workflow-template', id],
    queryFn: () => workflowTemplatesApi.get(id),
    enabled: !!id,
  });
  const template: WorkflowTemplateDetailDto | null = templateRes?.data ?? null;

  const { data: statsRes } = useQuery({
    queryKey: ['workflow-template', id, 'stats'],
    queryFn: () => workflowTemplatesApi.getStats(id),
    enabled: !!id,
  });
  const stats = statsRes?.data ?? null;

  const { data: taxonomyRes } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
  });
  const taxonomy = taxonomyRes?.data;
  const departments = taxonomy?.departments ?? [];

  const { data: usersRes } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });
  const users = usersRes?.data ?? [];
  const departmentUsers = users.filter((u) => u.role === 'DEPARTMENT_USER' || u.role === 'ADMIN');

  const updateTemplateMut = useMutation({
    mutationFn: (data: { name?: string | null; isActive?: boolean }) =>
      workflowTemplatesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setEditingName(false);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Update failed'),
  });

  const createSubtaskMut = useMutation({
    mutationFn: () =>
      workflowTemplatesApi.createSubtaskTemplate({
        workflowTemplateId: id,
        title: addSubtaskTitle.trim(),
        description: addSubtaskDescription.trim() || undefined,
        departmentId: addSubtaskDepartmentId || departments[0]?.id || '',
        assignedUserId: addSubtaskAssignedUserId || undefined,
        sortOrder: template?.subtaskTemplates?.length ?? 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setAddSubtaskTitle('');
      setAddSubtaskDescription('');
      setAddSubtaskDepartmentId('');
      setAddSubtaskAssignedUserId('');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Create failed'),
  });

  const reorderMut = useMutation({
    mutationFn: (subtaskTemplateIds: string[]) =>
      workflowTemplatesApi.reorderSubtaskTemplates(id, subtaskTemplateIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow-template', id] }),
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Reorder failed'),
  });

  const updateSubtaskMut = useMutation({
    mutationFn: (subtaskId: string) =>
      workflowTemplatesApi.updateSubtaskTemplate(subtaskId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        departmentId: editDepartmentId || undefined,
        assignedUserId: editAssignedUserId || undefined,
        sortOrder: editSortOrder,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setEditSubtaskId(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Update failed'),
  });

  const deleteSubtaskMut = useMutation({
    mutationFn: (subtaskId: string) => workflowTemplatesApi.deleteSubtaskTemplate(subtaskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setConfirmDeleteSubtaskId(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Delete failed'),
  });

  const addDepMut = useMutation({
    mutationFn: () =>
      workflowTemplatesApi.addDependency({
        workflowTemplateId: id,
        subtaskTemplateId: depSubtaskId,
        dependsOnSubtaskTemplateId: depDependsOnId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setDepSubtaskId('');
      setDepDependsOnId('');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Add dependency failed'),
  });

  const removeDepMut = useMutation({
    mutationFn: (d: WorkflowTemplateDependencyDto) =>
      workflowTemplatesApi.removeDependency({
        subtaskTemplateId: d.subtaskTemplateId,
        dependsOnSubtaskTemplateId: d.dependsOnSubtaskTemplateId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-template', id] });
      setConfirmRemoveDep(null);
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Remove failed'),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: () => workflowTemplatesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow-templates'] });
      router.push('/admin/workflow-templates');
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Delete failed'),
  });

  const subtasks = template?.subtaskTemplates ?? [];
  const sortedSubtasks = [...subtasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const deps = template?.templateDependencies ?? [];
  const idToTitle = new Map(subtasks.map((s) => [s.id, s.title]));

  const wouldCycle = depSubtaskId && depDependsOnId && wouldCreateCycle(deps, depSubtaskId, depDependsOnId);
  const canAddDep =
    depSubtaskId &&
    depDependsOnId &&
    depSubtaskId !== depDependsOnId &&
    !wouldCycle;

  const contextLabel = template
    ? [
        template.ticketClass?.name,
        template.supportTopic?.name ?? template.maintenanceCategory?.name,
        template.name,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const startEdit = (s: WorkflowTemplateSubtaskDto) => {
    setEditSubtaskId(s.id);
    setEditTitle(s.title);
    setEditDescription(s.description ?? '');
    setEditDepartmentId(s.departmentId);
    setEditAssignedUserId(s.assignedUserId ?? '');
    setEditSortOrder(s.sortOrder);
  };

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const next = [...sortedSubtasks];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      reorderMut.mutate(next.map((s) => s.id));
    },
    [sortedSubtasks, reorderMut],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= sortedSubtasks.length - 1) return;
      const next = [...sortedSubtasks];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      reorderMut.mutate(next.map((s) => s.id));
    },
    [sortedSubtasks, reorderMut],
  );

  const handleDragStart = (e: React.DragEvent, subtaskId: string) => {
    setDraggedId(subtaskId);
    e.dataTransfer.setData('text/plain', subtaskId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDraggedId(null);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;
    const fromIndex = sortedSubtasks.findIndex((s) => s.id === draggedId);
    if (fromIndex === -1 || fromIndex === dropIndex) return;
    const next = [...sortedSubtasks];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, removed);
    reorderMut.mutate(next.map((s) => s.id));
  };
  const handleDragEnd = () => setDraggedId(null);

  const depsForSubtask = (subtaskId: string) =>
    deps.filter((d) => d.subtaskTemplateId === subtaskId);

  if (isLoading || !template) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
        <Header title="Workflow template" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title={template.name || contextLabel || 'Workflow template'} />
      <div className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/workflow-templates')}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Row 1: context | usage */}
          <div className="dashboard-card flex flex-col rounded-xl p-4 min-h-[168px] h-full" style={panel}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Context</p>
              {!editingName && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 border-2 border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]"
                  onClick={() => {
                    setEditingName(true);
                    setName(template.name ?? '');
                  }}
                >
                  {template.name ? 'Edit name' : 'Add name'}
                </Button>
              )}
            </div>
            <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{contextLabel}</p>
            {editingName ? (
              <div className="mt-3 flex gap-2 items-center flex-wrap">
                <Input
                  value={name || template.name || ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Template name"
                  className="max-w-xs"
                />
                <Button size="sm" onClick={() => updateTemplateMut.mutate({ name: name.trim() || null })} loading={updateTemplateMut.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingName(false); setName(''); }}>
                  Cancel
                </Button>
              </div>
            ) : null}
            <div
              className={cn(
                'mt-auto pt-3 flex flex-wrap items-center gap-3',
                updateTemplateMut.isPending && 'pointer-events-none opacity-60',
              )}
            >
              <span
                className={cn(
                  'min-w-[3.25rem] text-xs font-medium tabular-nums',
                  !template.isActive ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]',
                )}
              >
                Inactive
              </span>
              <button
                type="button"
                onClick={() => updateTemplateMut.mutate({ isActive: !template.isActive })}
                disabled={updateTemplateMut.isPending}
                className="focus-ring shrink-0 rounded-full p-0.5 transition-opacity hover:opacity-90 disabled:opacity-50"
                aria-pressed={template.isActive}
                aria-label={
                  template.isActive ? 'Active — click to deactivate template' : 'Inactive — click to activate template'
                }
              >
                <div
                  className={cn(
                    'relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-150',
                    template.isActive
                      ? 'bg-[var(--color-success)]'
                      : 'border border-[var(--color-border-default)] bg-[var(--color-bg-surface-inset)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
                      template.isActive ? 'translate-x-[16px]' : 'translate-x-0',
                    )}
                    style={{
                      boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-text-primary) 14%, transparent)',
                    }}
                  />
                </div>
              </button>
              <span
                className={cn(
                  'min-w-[3.25rem] text-xs font-medium tabular-nums',
                  template.isActive ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]',
                )}
              >
                Active
              </span>
            </div>
          </div>

          <div className="dashboard-card flex flex-col rounded-xl p-4 min-h-[168px] h-full" style={panel}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">Usage & execution</h3>
            {stats == null ? (
              <div className="flex flex-1 items-center justify-center py-6">
                <div className="animate-spin h-6 w-6 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:gap-4 text-sm flex-1">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Tickets using template</p>
                  <p className="text-lg font-semibold text-[var(--color-text-primary)] mt-0.5">{stats.ticketsUsingTemplate}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Active executions</p>
                  <p className="text-lg font-semibold text-amber-400 mt-0.5">{stats.activeExecutions}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Completed executions</p>
                  <p className="text-lg font-semibold text-[var(--color-accent)] mt-0.5">{stats.completedExecutions}</p>
                </div>
              </div>
            )}
          </div>

          {/* Row 2: workflow subtask template | dependency graph */}
          <div className="dashboard-card flex h-full min-h-0 flex-col rounded-xl p-4" style={panel}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Workflow Subtask Template:</h3>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] inline-flex items-center"
              onClick={() => setSubtasksCollapsed((c) => !c)}
            >
              {subtasksCollapsed ? (
                <>Expand <ChevronRight className="h-4 w-4 ml-1 shrink-0" /></>
              ) : (
                <>Collapse <ChevronDown className="h-4 w-4 ml-1 shrink-0" /></>
              )}
            </Button>
          </div>
          <CollapsibleBody collapsed={subtasksCollapsed}>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">Drag to reorder or use Move up / Move down. Changes save immediately.</p>
          {sortedSubtasks.map((s, index) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => handleDragStart(e, s.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`border-b py-3 last:border-0 flex items-start gap-2 ${draggedId === s.id ? 'opacity-50' : ''}`}
              style={{ borderBottomColor: 'var(--color-border-default)' }}
            >
              <div className="flex flex-col gap-0.5 shrink-0 pt-0.5">
                <GripVertical className="h-4 w-4 text-[var(--color-text-muted)] cursor-grab active:cursor-grabbing" />
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0 || reorderMut.isPending}
                  className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === sortedSubtasks.length - 1 || reorderMut.isPending}
                  className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {editSubtaskId === s.id ? (
                <div className="space-y-2 flex-1">
                  <Input label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Textarea label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
                  <ComboBox
                    label="Department"
                    placeholder="— Department —"
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    value={editDepartmentId}
                    onChange={setEditDepartmentId}
                  />
                  <UserSearchSelect
                    label="Assigned user (optional)"
                    users={departmentUsers}
                    value={editAssignedUserId}
                    onChange={setEditAssignedUserId}
                    placeholder="Search by name or email…"
                    dropdownPosition="above"
                  />
                  <Input label="Sort order" type="number" value={editSortOrder} onChange={(e) => setEditSortOrder(Number(e.target.value))} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateSubtaskMut.mutate(s.id)} loading={updateSubtaskMut.isPending}>Save</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditSubtaskId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start flex-1">
                  <div>
                    <p className="font-medium text-[var(--color-text-primary)]">{s.title}</p>
                    {s.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{s.description}</p>}
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      Dept: {s.department?.name ?? s.departmentId} · Order: {s.sortOrder}
                      {s.assignedUser != null && ` · Assigned: ${String(s.assignedUser.name ?? s.assignedUser.email)}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(s)}>Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteSubtaskId(s.id)}>Remove</Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Add subtask</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input placeholder="Title" value={addSubtaskTitle} onChange={(e) => setAddSubtaskTitle(e.target.value)} />
              <ComboBox
                placeholder="— Department —"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                value={addSubtaskDepartmentId}
                onChange={setAddSubtaskDepartmentId}
              />
            </div>
            <Textarea placeholder="Description (optional)" value={addSubtaskDescription} onChange={(e) => setAddSubtaskDescription(e.target.value)} rows={2} className="mt-2" />
            <UserSearchSelect
              label="Assigned user (optional)"
              users={departmentUsers}
              value={addSubtaskAssignedUserId}
              onChange={setAddSubtaskAssignedUserId}
              placeholder="Search by name or email…"
              dropdownPosition="above"
              className="mt-2 max-w-xs"
            />

            <div
              className="mt-3 overflow-hidden rounded-lg"
              style={{ border: '1px solid var(--color-border-default)', background: 'var(--color-bg-surface)' }}
            >
              <button
                type="button"
                onClick={() => setAddDepSectionCollapsed((c) => !c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-bg-surface-raised)]"
                aria-expanded={!addDepSectionCollapsed}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {addDepSectionCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  )}
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">Add Dependency</span>
                </span>
                <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  Optional
                </span>
              </button>
              <CollapsibleBody collapsed={addDepSectionCollapsed}>
                <div
                  className="space-y-3 border-t px-3 pb-3 pt-3"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Define which subtask must complete before another can start. Cycles are not allowed.
                  </p>
                  {deps.length > 0 && (
                    <ul className="space-y-1">
                      {deps.map((d) => (
                        <li
                          key={`${d.subtaskTemplateId}-${d.dependsOnSubtaskTemplateId}`}
                          className="flex flex-wrap items-center gap-2 text-sm"
                        >
                          <span className="text-[var(--color-text-primary)]">{idToTitle.get(d.subtaskTemplateId)}</span>
                          <span className="text-[var(--color-text-muted)]">depends on</span>
                          <span className="text-[var(--color-text-primary)]">{idToTitle.get(d.dependsOnSubtaskTemplateId)}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400"
                            onClick={() => setConfirmRemoveDep(d)}
                            loading={removeDepMut.isPending}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-end gap-2">
                    <ComboBox
                      placeholder="— This subtask —"
                      options={subtasks.map((s) => ({ value: s.id, label: s.title }))}
                      value={depSubtaskId}
                      onChange={(v) => {
                        setDepSubtaskId(v);
                        setDepDependsOnId('');
                      }}
                      className="min-w-[180px]"
                    />
                    <ComboBox
                      placeholder="— Depends on —"
                      options={subtasks
                        .filter((s) => s.id !== depSubtaskId)
                        .filter((s) => !depSubtaskId || !wouldCreateCycle(deps, depSubtaskId, s.id))
                        .map((s) => ({ value: s.id, label: s.title }))}
                      value={depDependsOnId}
                      onChange={setDepDependsOnId}
                      className="min-w-[180px]"
                    />
                    <Button size="sm" onClick={() => addDepMut.mutate()} disabled={!canAddDep} loading={addDepMut.isPending}>
                      Add dependency
                    </Button>
                  </div>
                  {depSubtaskId && depDependsOnId === depSubtaskId && (
                    <p className="text-xs text-amber-400">A subtask cannot depend on itself.</p>
                  )}
                  {wouldCycle && (
                    <p className="text-xs text-amber-400">
                      Adding this dependency would create a cycle. Choose a different “Depends on” option.
                    </p>
                  )}
                </div>
              </CollapsibleBody>
            </div>

            <Button className="mt-2" size="sm" onClick={() => createSubtaskMut.mutate()} disabled={!addSubtaskTitle.trim() || !(addSubtaskDepartmentId || departments[0]?.id)} loading={createSubtaskMut.isPending}>
              Add subtask
            </Button>
          </div>
          </CollapsibleBody>
        </div>

          <div className="dashboard-card flex flex-col rounded-xl p-4 min-h-0 h-full" style={panel}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Dependency graph</h3>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] inline-flex items-center"
                onClick={() => setGraphCollapsed((c) => !c)}
              >
                {graphCollapsed ? (
                  <>Expand <ChevronRight className="h-4 w-4 ml-1 shrink-0" /></>
                ) : (
                  <>Collapse <ChevronDown className="h-4 w-4 ml-1 shrink-0" /></>
                )}
              </Button>
            </div>
            <CollapsibleBody collapsed={graphCollapsed}>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">Nodes = subtask templates. Arrows = “depends on”.</p>
              <div className="relative min-h-[120px] flex-1">
                {sortedSubtasks.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No subtasks yet. Add subtasks in the workflow template to see the graph.</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      {sortedSubtasks.map((s, i) => (
                        <div
                          key={s.id}
                          className="rounded-lg border px-3 py-2 text-sm flex items-center gap-2"
                          style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface-raised)', marginLeft: 0 }}
                        >
                          <span className="text-[var(--color-text-muted)] w-6">{i + 1}</span>
                          <span className="text-[var(--color-text-primary)] font-medium">{s.title}</span>
                        </div>
                      ))}
                    </div>
                    {deps.length > 0 && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--color-border-default)' }}>
                        <p className="text-xs text-[var(--color-text-muted)] mb-1">Edges (A depends on B):</p>
                        <ul className="space-y-0.5 text-xs text-[var(--color-text-secondary)]">
                          {deps.map((d) => (
                            <li key={`${d.subtaskTemplateId}-${d.dependsOnSubtaskTemplateId}`}>
                              <span className="text-[var(--color-accent)]">{idToTitle.get(d.dependsOnSubtaskTemplateId)}</span>
                              <span className="mx-1">→</span>
                              <span className="text-[var(--color-text-primary)]">{idToTitle.get(d.subtaskTemplateId)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CollapsibleBody>
          </div>
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Delete template */}
        <div className="rounded-xl p-4 border border-red-900/30" style={{ background: 'rgba(127,29,29,0.2)' }}>
          <p className="text-sm text-[var(--color-text-secondary)]">Deleting this template does not affect existing tickets. New tickets for this context will have no auto-subtasks.</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 text-red-400 border-red-800"
            onClick={() => setConfirmDeleteTemplate(true)}
            disabled={deleteTemplateMut.isPending}
          >
            Delete workflow template
          </Button>
        </div>
      </div>

      {/* Confirm delete subtask modal */}
      {confirmDeleteSubtaskId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDeleteSubtaskId(null)}>
          <div className="rounded-xl p-5 max-w-md w-full mx-4 shadow-xl border" style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-default)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Remove subtask template?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Removing this subtask will also remove {depsForSubtask(confirmDeleteSubtaskId).length} dependency link(s).
              {stats != null && stats.ticketsUsingTemplate > 0 && ` ${stats.ticketsUsingTemplate} ticket(s) currently use this template.`} Are you sure?
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmDeleteSubtaskId(null)}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => deleteSubtaskMut.mutate(confirmDeleteSubtaskId)} loading={deleteSubtaskMut.isPending}>
                Remove subtask
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove dependency modal */}
      {confirmRemoveDep != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmRemoveDep(null)}>
          <div className="rounded-xl p-5 max-w-md w-full mx-4 shadow-xl border" style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-default)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Remove dependency?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              <span className="text-[var(--color-text-primary)]">{idToTitle.get(confirmRemoveDep.subtaskTemplateId)}</span> will no longer wait for{' '}
              <span className="text-[var(--color-text-primary)]">{idToTitle.get(confirmRemoveDep.dependsOnSubtaskTemplateId)}</span>. Continue?
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setConfirmRemoveDep(null)}>Cancel</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => removeDepMut.mutate(confirmRemoveDep)} loading={removeDepMut.isPending}>
                Remove dependency
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete workflow template */}
      {confirmDeleteTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !deleteTemplateMut.isPending && setConfirmDeleteTemplate(false)}
        >
          <div
            className="rounded-xl p-5 max-w-md w-full mx-4 shadow-xl border"
            style={{ background: 'var(--color-bg-surface)', borderColor: 'var(--color-border-default)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Delete workflow template?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Are you sure? Deleting this template does not affect existing tickets. New tickets for this context will have no auto-subtasks.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDeleteTemplate(false)}
                disabled={deleteTemplateMut.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteTemplateMut.mutate()}
                loading={deleteTemplateMut.isPending}
              >
                Delete template
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
