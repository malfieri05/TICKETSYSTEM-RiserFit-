'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { dispatchApi, adminApi, invalidateTicketLists } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DISPATCH_TRADE_TYPE_LABELS } from '@ticketing/types';
import { useQuery } from '@tanstack/react-query';

type GroupType = 'one-time' | 'template';

interface Props {
  anchorTicket: any;
  anchorTicketId: string;
  selectedTicketIds: string[];
  radiusMiles: number;
  allSelectedReady: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateDispatchGroupModal({
  anchorTicket,
  anchorTicketId,
  selectedTicketIds,
  radiusMiles,
  allSelectedReady,
  onClose,
  onSuccess,
}: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [groupType, setGroupType] = useState<GroupType>('one-time');
  const [groupName, setGroupName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateAnchorStudioId, setTemplateAnchorStudioId] = useState<string | null>(anchorTicket?.studioId ?? null);
  const [templateMaintenanceCategoryId, setTemplateMaintenanceCategoryId] = useState<string>(anchorTicket?.maintenanceCategoryId ?? '');

  const { data: taxonomyRes } = useQuery({
    queryKey: ['ticket-taxonomy'],
    queryFn: () => adminApi.getTicketTaxonomy(),
    enabled: groupType === 'template',
  });
  const maintenanceCategories = taxonomyRes?.data?.maintenanceCategories ?? [];

  const createGroupMut = useMutation({
    mutationFn: (data: { tradeType: string; ticketIds: string[]; notes?: string }) =>
      dispatchApi.createGroup(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['dispatch', 'groups'] });
      qc.invalidateQueries({ queryKey: ['dispatch', 'ready'] });
      invalidateTicketLists(qc);
      onSuccess();
      if (res.data?.id) router.push(`/admin/dispatch/groups/${res.data.id}`);
    },
  });

  const createTemplateMut = useMutation({
    mutationFn: (data: {
      name: string;
      dispatchTradeType: string;
      maintenanceCategoryId?: string;
      anchorStudioId?: string;
      radiusMiles: number;
    }) => dispatchApi.createTemplate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatch', 'templates'] });
      onSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (groupType === 'one-time') {
      const tradeType = anchorTicket?.dispatchTradeType;
      if (!tradeType) return;
      const others = selectedTicketIds.filter((id) => id !== anchorTicketId);
      const ticketIds = [anchorTicketId, ...others];
      createGroupMut.mutate({ tradeType, ticketIds, notes: groupName || undefined });
    } else {
      const tradeType = anchorTicket?.dispatchTradeType;
      if (!tradeType || !templateName.trim()) return;
      createTemplateMut.mutate({
        name: templateName.trim(),
        dispatchTradeType: tradeType,
        maintenanceCategoryId: templateMaintenanceCategoryId || undefined,
        anchorStudioId: templateAnchorStudioId != null ? templateAnchorStudioId : undefined,
        radiusMiles,
      });
    }
  };

  const oneTimeValid = groupType !== 'one-time' || true;
  const templateValid = groupType !== 'template' || templateName.trim().length > 0;
  const canSubmitOneTime = groupType === 'one-time' && allSelectedReady && oneTimeValid;
  const canSubmitTemplate = groupType === 'template' && templateValid;
  const isSubmitting = createGroupMut.isPending || createTemplateMut.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6"
        style={{
          background: 'var(--color-bg-surface-raised)',
          border: '1px solid var(--color-border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Create Dispatch Group
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Group type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="groupType"
                  checked={groupType === 'one-time'}
                  onChange={() => setGroupType('one-time')}
                  className="rounded-full"
                />
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>One-Time Group</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="groupType"
                  checked={groupType === 'template'}
                  onChange={() => setGroupType('template')}
                  className="rounded-full"
                />
                <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>Group Template</span>
              </label>
            </div>
          </div>

          {groupType === 'one-time' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Group name (optional)
                </label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Downtown run"
                  className="w-full"
                />
              </div>
              {!allSelectedReady && (
                <p className="text-xs" style={{ color: 'var(--color-danger, #dc2626)' }}>
                  Only tickets marked Ready for Dispatch can be added. Remove non-ready tickets from the selection or mark them ready first.
                </p>
              )}
            </>
          )}

          {groupType === 'template' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Template name *
                </label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. HVAC nearby 10mi"
                  className="w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Trade type
                </label>
                <Input
                  value={anchorTicket?.dispatchTradeType ? (DISPATCH_TRADE_TYPE_LABELS as any)[anchorTicket.dispatchTradeType] ?? anchorTicket.dispatchTradeType : ''}
                  readOnly
                  className="w-full opacity-80"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Maintenance category (optional)
                </label>
                <Select
                  value={templateMaintenanceCategoryId}
                  onChange={(e) => setTemplateMaintenanceCategoryId(e.target.value)}
                  className="w-full"
                >
                  <option value="">Any</option>
                  {maintenanceCategories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Anchor location
                </label>
                <div className="flex items-center gap-2">
                  <Select
                    value={templateAnchorStudioId ?? ''}
                    onChange={(e) => setTemplateAnchorStudioId(e.target.value || null)}
                    className="flex-1 min-w-0"
                  >
                    <option value="">Use at any location</option>
                    {anchorTicket?.studio && (
                      <option value={anchorTicket.studio.id}>{anchorTicket.studio.name}</option>
                    )}
                  </Select>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Clear for reusable</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                  Radius (miles)
                </label>
                <Input type="number" value={radiusMiles} readOnly className="w-full opacity-80" />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            {groupType === 'one-time' ? (
              <Button type="submit" disabled={!canSubmitOneTime || isSubmitting} loading={isSubmitting}>
                Create group
              </Button>
            ) : (
              <Button type="submit" disabled={!canSubmitTemplate || isSubmitting} loading={isSubmitting}>
                Create template
              </Button>
            )}
          </div>
        </form>

        {(createGroupMut.isError || createTemplateMut.isError) && (
          <p className="text-xs mt-3" style={{ color: 'var(--color-danger, #dc2626)' }}>
            {(createGroupMut.error as any)?.response?.data?.message ?? (createTemplateMut.error as any)?.response?.data?.message ?? 'Request failed.'}
          </p>
        )}
      </div>
    </div>
  );
}
