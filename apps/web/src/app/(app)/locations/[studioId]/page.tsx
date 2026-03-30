'use client';

import { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, MapPin, Building2, Users, Phone,
  FileText, Tag, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { locationsApi, ticketsApi, invalidateTicketLists } from '@/lib/api';
import type { TicketListItem } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { TicketTableRow, CANONICAL_FEED_HEADERS, getThClass } from '@/components/tickets/TicketRow';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { useAuth } from '@/hooks/useAuth';

type ViewTab = 'active' | 'completed';
const PAGE_SIZE = 20;

function ProfileSection({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ElementType;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: POLISH_THEME.listBg,
        borderColor: POLISH_THEME.listBorder,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b text-left"
        style={{
          borderColor: POLISH_THEME.listBorder,
          background: POLISH_THEME.tableHeaderBg,
        }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h3>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-300"
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
      </button>
      <div
        className="grid workspace-collapsible-grid"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 py-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <dt className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </dt>
      <dd className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
        {value}
      </dd>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-6 w-48 rounded" style={{ background: 'var(--color-border-default)' }} />
      <div className="h-4 w-72 rounded" style={{ background: 'var(--color-border-subtle)' }} />
      <div className="flex gap-3 mt-2">
        <div className="h-7 w-24 rounded-lg" style={{ background: 'var(--color-border-default)' }} />
        <div className="h-7 w-32 rounded-lg" style={{ background: 'var(--color-border-default)' }} />
      </div>
    </div>
  );
}

function formatDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Expect YYYY-MM-DD; render in local timezone without drifting.
  const [y, m, d] = dateStr.split('-').map((n) => Number(n));
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function LocationProfilePage() {
  const { studioId } = useParams<{ studioId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [viewTab, setViewTab] = useState<ViewTab>('active');
  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    studioDetails: false,
    ownership: false,
    contact: false,
    identifiers: false,
  });

  const { data: profileRes, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['location-profile', studioId],
    queryFn: () => locationsApi.getProfile(studioId),
    enabled: !!studioId,
  });
  const profile = profileRes?.data;

  const ticketParams = {
    studioId,
    statusGroup: viewTab as 'active' | 'completed',
    page,
    limit: PAGE_SIZE,
  };

  const {
    data: ticketsRes,
    isLoading: ticketsLoading,
    isFetching: ticketsFetching,
    error: ticketsError,
  } = useQuery({
    queryKey: ['location-tickets', studioId, viewTab, page],
    queryFn: () => ticketsApi.list(ticketParams),
    enabled: !!studioId,
  });

  const tickets: TicketListItem[] = ticketsRes?.data?.data ?? [];
  const ticketsTotal = ticketsRes?.data?.total ?? 0;
  const totalPages = Math.ceil(ticketsTotal / PAGE_SIZE);
  const isProfile403 = (profileError as { response?: { status?: number } })?.response?.status === 403;
  const isTickets403 = (ticketsError as { response?: { status?: number } })?.response?.status === 403;

  const handleSelect = useCallback((id: string) => {
    setSelectedTicketId((prev) => (prev === id ? null : id));
  }, []);
  const handleCloseDrawer = useCallback(() => setSelectedTicketId(null), []);

  const canAddTag = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const addTagMut = useMutation({
    mutationFn: ({ ticketId, label }: { ticketId: string; label: string }) =>
      ticketsApi.addTag(ticketId, { label }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      qc.invalidateQueries({ queryKey: ['location-tickets', studioId] });
      invalidateTicketLists(qc);
    },
  });
  const handleAddTag = useCallback(
    async (ticketId: string, label: string) => {
      await addTagMut.mutateAsync({ ticketId, label });
    },
    [addTagMut],
  );

  const operational = profile?.profile?.public;
  const hasOperational = operational && Object.values(operational).some((v) => v != null);

  const restricted = profile?.profile?.restricted;
  const hasOwnershipData = !!restricted?.ownership && Object.values(restricted.ownership).some((v) => v != null);
  const hasContactData = !!restricted?.contact && Object.values(restricted.contact).some((v) => v != null);
  const hasIdentifiersData = !!restricted?.identifiers && Object.values(restricted.identifiers).some((v) => v != null);

  useEffect(() => {
    if (profileRes?.data) {
      console.log('[LocationProfile] profileRes.data', profileRes.data);
    }
  }, [profileRes?.data]);

  useEffect(() => {
    if (ticketsError) {
      console.log('[LocationProfile] ticketsError status', (ticketsError as { response?: { status?: number } })?.response?.status);
    }
  }, [ticketsError]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header
        title={profile?.studio?.name ?? 'Location Profile'}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          {/* ── Header / Identity ── */}
          {profileLoading ? (
            <HeaderSkeleton />
          ) : profile ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Building2 className="h-6 w-6 shrink-0" style={{ color: 'var(--color-accent)' }} />
                <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  {profile.studio.name}
                </h1>
                {!profile.studio.isActive && (
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--color-bg-surface-raised)', color: 'var(--color-text-muted)' }}
                  >
                    Inactive
                  </span>
                )}
              </div>
              {profile.studio.formattedAddress && (
                <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {profile.studio.formattedAddress}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <span>{profile.studio.market.name}</span>
                {profile.studio.externalCode && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{profile.studio.externalCode}</span>
                  </>
                )}
              </div>
            </div>
          ) : isProfile403 ? (
            <div className="flex items-center gap-3 py-8" style={{ color: 'var(--color-text-muted)' }}>
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm">You don&apos;t have permission to view this location profile.</p>
            </div>
          ) : (
            <div className="py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Location not found.
            </div>
          )}

          {/* ── Profile Sections (full-width stack: ownership → contact → details → identifiers) ── */}
          {profile && (
            <div className="flex flex-col gap-4 w-full">
              {profile.visibility.showOwnership && hasOwnershipData && restricted && (
                <ProfileSection
                  title="Ownership & Team"
                  icon={Users}
                  open={openSections.ownership}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, ownership: !prev.ownership }))}
                >
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-x-8 gap-y-2">
                    <ProfileField label="DM" value={restricted.ownership.dm} />
                    <ProfileField label="GM" value={restricted.ownership.gm} />
                    <ProfileField label="AGM" value={restricted.ownership.agm} />
                    <ProfileField label="EDC" value={restricted.ownership.edc} />
                    <ProfileField label="LI" value={restricted.ownership.li} />
                  </dl>
                </ProfileSection>
              )}

              {profile.visibility.showContact && hasContactData && restricted && (
                <ProfileSection
                  title="Contact Information"
                  icon={Phone}
                  open={openSections.contact}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, contact: !prev.contact }))}
                >
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <ProfileField label="Studio Email" value={restricted.contact.studioEmail} />
                    <ProfileField label="GM Email" value={restricted.contact.gmEmail} />
                    <ProfileField label="GM Teams" value={restricted.contact.gmTeams} />
                    <ProfileField label="LI Email" value={restricted.contact.liEmail} />
                  </dl>
                </ProfileSection>
              )}

              {hasOperational && (
                <ProfileSection
                  title="Studio Details"
                  icon={Building2}
                  open={openSections.studioDetails}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, studioDetails: !prev.studioDetails }))}
                >
                  <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
                    <ProfileField label="District" value={operational.district} />
                    <ProfileField label="Status" value={operational.status} />
                    <ProfileField label="Maturity" value={operational.maturity} />
                    <ProfileField label="Studio Size" value={operational.studioSize} />
                    <ProfileField label="Price Tier" value={operational.priceTier} />
                    <ProfileField label="Open Type" value={operational.openType} />
                    <ProfileField
                      label="Studio Open Date"
                      value={formatDateOnly(operational.studioOpenDate)}
                    />
                    <ProfileField
                      label="RF Soft Open Date"
                      value={formatDateOnly(operational.rfSoftOpenDate)}
                    />
                  </dl>
                </ProfileSection>
              )}

              {profile.visibility.showIdentifiers && hasIdentifiersData && restricted && (
                <ProfileSection
                  title="Internal Identifiers"
                  icon={Tag}
                  open={openSections.identifiers}
                  onToggle={() => setOpenSections((prev) => ({ ...prev, identifiers: !prev.identifiers }))}
                >
                  <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
                    <ProfileField label="Studio Code" value={restricted.identifiers.studioCode} />
                    <ProfileField label="NetSuite Name" value={restricted.identifiers.netsuiteName} />
                    <ProfileField label="IKIMIST Name" value={restricted.identifiers.ikismetName} />
                    <ProfileField label="CR Name" value={restricted.identifiers.crName} />
                    <ProfileField label="CR Id" value={restricted.identifiers.crId} />
                    <ProfileField label="Paycom Code" value={restricted.identifiers.paycomCode} />
                  </dl>
                </ProfileSection>
              )}
            </div>
          )}

          {/* ── Tickets Section ── */}
          {profile && isTickets403 ? (
            <div className="flex items-center gap-3 py-6" style={{ color: 'var(--color-text-muted)' }}>
              <AlertTriangle className="h-5 w-5" />
              <p className="text-sm">You don&apos;t have access to tickets for this location.</p>
            </div>
          ) : profile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Tickets
                </h2>
              </div>

              {/* Tabs */}
              <div
                className="flex items-center gap-1"
                style={{ borderBottom: '1px solid var(--color-border-default)' }}
              >
                {([
                  { key: 'active' as ViewTab, label: 'Active' },
                  { key: 'completed' as ViewTab, label: 'Completed' },
                ] as const).map(({ key, label }) => {
                  const active = viewTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => { setViewTab(key); setPage(1); }}
                      data-active={active}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-t-lg text-sm font-medium transition-all [&:not([data-active])]:hover:text-[var(--color-text-secondary)]"
                      style={{
                        background: active ? 'var(--color-bg-surface)' : 'transparent',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        border: active ? '1px solid var(--color-border-default)' : '1px solid transparent',
                        borderBottom: active ? '1px solid var(--color-bg-surface)' : undefined,
                        marginBottom: '-1px',
                      }}
                    >
                      {label}
                      {active && ticketsTotal > 0 && (
                        <span
                          className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--color-bg-surface-raised)', color: 'var(--color-text-primary)' }}
                        >
                          {ticketsTotal}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Ticket List */}
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: POLISH_THEME.listBorder, background: POLISH_THEME.listBg }}
              >
                {ticketsLoading ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
                        {CANONICAL_FEED_HEADERS.map((h) => (
                          <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <TicketsTableSkeletonRows count={5} />
                  </table>
                ) : tickets.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-2`}>
                    <FileText className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {viewTab === 'active'
                        ? 'No active tickets for this location.'
                        : 'No completed tickets for this location.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${POLISH_THEME.listBorder}`, background: POLISH_THEME.tableHeaderBg }}>
                          {CANONICAL_FEED_HEADERS.map((h) => (
                            <th key={h.key} className={getThClass(h.key)} style={{ color: POLISH_THEME.theadText }}>{h.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map((ticket) => {
                          const totalSubtasks = (ticket as { totalSubtasks?: number }).totalSubtasks ?? ticket._count?.subtasks ?? 0;
                          const completedSubtasks = (ticket as { completedSubtasks?: number }).completedSubtasks ?? 0;
                          return (
                            <TicketTableRow
                              key={ticket.id}
                              id={ticket.id}
                              title={ticket.title}
                              status={ticket.status}
                              dueDate={ticket.dueDate}
                              createdAt={ticket.createdAt}
                              tags={ticket.tags ?? []}
                              canAddTag={canAddTag}
                              onAddTag={canAddTag ? handleAddTag : undefined}
                              isAddingTag={
                                addTagMut.isPending && addTagMut.variables?.ticketId === ticket.id
                              }
                              commentCount={ticket._count?.comments ?? 0}
                              completedSubtasks={completedSubtasks}
                              totalSubtasks={totalSubtasks}
                              requesterDisplayName={ticket.requester?.displayName ?? '—'}
                              isSelected={selectedTicketId === ticket.id}
                              onSelect={handleSelect}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                    {totalPages > 1 && (
                      <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{ borderTop: '1px solid var(--color-border-default)' }}
                      >
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, ticketsTotal)} of {ticketsTotal}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={page <= 1 || ticketsFetching}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={page >= totalPages || ticketsFetching}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <TicketDrawer ticketId={selectedTicketId} onClose={handleCloseDrawer} />
    </div>
  );
}
