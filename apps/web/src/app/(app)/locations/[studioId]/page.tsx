'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  ArrowLeft, MapPin, Building2, Users, Phone,
  FileText, Ticket, Tag, AlertTriangle, ChevronDown, Check,
} from 'lucide-react';
import { locationsApi, ticketsApi, updateTicketRowInListCaches } from '@/lib/api';
import type { LocationProfileResponse, TicketListItem } from '@/types';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import {
  TicketTableRow,
  ticketRequesterEmail,
  ticketRequesterPrimaryLine,
} from '@/components/tickets/TicketRow';
import { TicketFeedColgroup, TicketFeedThead } from '@/components/tickets/TicketFeedThead';
import { TicketFeedSelectionRail } from '@/components/tickets/TicketFeedSelectionRail';
import { FeedPaginationBar } from '@/components/tickets/FeedPaginationBar';
import { TicketDrawer } from '@/components/tickets/TicketDrawer';
import { TicketsTableSkeletonRows } from '@/components/inbox/ListSkeletons';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';
import { useTicketFeedIdColumnVisible } from '@/hooks/useTicketFeedIdColumnVisible';
import { useAuth } from '@/hooks/useAuth';
import { InstantTooltip } from '@/components/tickets/TicketTagCapsule';

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
      className="dashboard-card rounded-xl border overflow-hidden"
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
          background: POLISH_THEME.feedTheadBg,
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
  const [showTicketIdColumn, toggleTicketIdColumn] = useTicketFeedIdColumnVisible();
  const [openSections, setOpenSections] = useState({
    studioDetails: false,
    ownership: false,
    contact: false,
    identifiers: false,
  });

  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<LocationProfileResponse>({
    queryKey: ['location-profile', studioId],
    queryFn: async () => {
      const res = await locationsApi.getProfile(studioId!);
      return res.data;
    },
    enabled: !!studioId,
  });

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
  const feedTicketIds = useMemo(() => tickets.map((t) => t.id), [tickets]);
  const profileErrStatus = isAxiosError(profileError) ? profileError.response?.status : undefined;
  const isProfile403 = profileErrStatus === 403;
  const isProfile404 = profileErrStatus === 404;
  const isTickets403 = isAxiosError(ticketsError) ? ticketsError.response?.status === 403 : false;

  const handleSelect = useCallback((id: string) => {
    setSelectedTicketId((prev) => (prev === id ? null : id));
  }, []);
  const handleCloseDrawer = useCallback(() => setSelectedTicketId(null), []);

  const isStudioUser = user?.role === 'STUDIO_USER';
  const canAddTag = user?.role === 'ADMIN' || user?.role === 'DEPARTMENT_USER';
  const addTagMut = useMutation({
    mutationFn: ({ ticketId, label }: { ticketId: string; label: string }) =>
      ticketsApi.addTag(ticketId, { label }),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      const body = res.data;
      updateTicketRowInListCaches(qc, variables.ticketId, (t) => ({
        ...t,
        tags: [
          ...(t.tags ?? []),
          {
            id: body.tag.id,
            name: body.tag.name,
            color: body.tag.color ?? null,
            createdAt: body.createdAt,
            createdBy: body.createdBy,
          },
        ],
      }));
    },
  });
  const handleAddTag = useCallback(
    async (ticketId: string, label: string) => {
      await addTagMut.mutateAsync({ ticketId, label });
    },
    [addTagMut],
  );

  const removeTagMut = useMutation({
    mutationFn: ({ ticketId, tagId }: { ticketId: string; tagId: string }) =>
      ticketsApi.removeTag(ticketId, tagId),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['ticket', variables.ticketId] });
      updateTicketRowInListCaches(qc, variables.ticketId, (t) => ({
        ...t,
        tags: (t.tags ?? []).filter((x) => x.id !== variables.tagId),
      }));
    },
  });
  const handleRemoveTag = useCallback(
    async (ticketId: string, tagId: string) => {
      await removeTagMut.mutateAsync({ ticketId, tagId });
    },
    [removeTagMut],
  );

  const operational = profile?.profile?.public;
  const hasOperational = operational && Object.values(operational).some((v) => v != null);

  const restricted = profile?.profile?.restricted;
  const hasOwnershipData = !!restricted?.ownership && Object.values(restricted.ownership).some((v) => v != null);
  const hasContactData = !!restricted?.contact && Object.values(restricted.contact).some((v) => v != null);
  const hasIdentifiersData = !!restricted?.identifiers && Object.values(restricted.identifiers).some((v) => v != null);

  // Normalize URL when API resolved /locations/:id via ticket-id alias (id in bar matches studio).
  useEffect(() => {
    const resolvedId = profile?.studio?.id;
    if (!resolvedId || !studioId || resolvedId === studioId) return;
    router.replace(`/locations/${resolvedId}`);
  }, [profile?.studio?.id, studioId, router]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-bg-page)' }}>
      <Header title="Location info:" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(isStudioUser ? '/portal' : '/tickets')}
          >
            <ArrowLeft className="h-4 w-4" />
            {isStudioUser ? 'Back to My Tickets' : 'Back to tickets'}
          </Button>

          {/* ── Header / Identity ── */}
          {profileLoading ? (
            <HeaderSkeleton />
          ) : profile ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
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
                {profile.hasPublishedLeaseIqRuleset ? (
                  <>
                    <span
                      className="text-xl font-light leading-none text-[var(--color-text-muted)] opacity-70 select-none"
                      aria-hidden
                    >
                      |
                    </span>
                    <InstantTooltip
                      content={
                        <span className="inline-flex items-center gap-1.5 text-left">
                          <Check
                            className="h-3.5 w-3.5 shrink-0"
                            strokeWidth={2.5}
                            style={{ color: POLISH_THEME.success }}
                            aria-hidden
                          />
                          <span>Has published LeaseIQ ruleset</span>
                        </span>
                      }
                      compact
                      className="inline-flex shrink-0 text-[var(--color-text-muted)]"
                    >
                      <span className="inline-flex">
                        <FileText className="h-4 w-4 opacity-70" strokeWidth={2} aria-hidden />
                      </span>
                    </InstantTooltip>
                  </>
                ) : null}
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
          ) : profileError && !isProfile404 && !isProfile403 ? (
            <div className="flex flex-col gap-2 py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              <p>Couldn&apos;t load this location. Check your connection and try again.</p>
              <Button variant="outlineAccent" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['location-profile', studioId] })}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="py-8 text-sm space-y-2" style={{ color: 'var(--color-text-muted)' }}>
              <p>We couldn&apos;t find a studio for this link.</p>
              <p className="text-xs">
                If you opened this from a ticket, the location may have been removed from the ticket, or the link may be out of date.
                {user?.role === 'ADMIN' && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="underline text-[var(--color-accent)] hover:opacity-90"
                      onClick={() => router.push('/admin/markets')}
                    >
                      Open Locations (admin)
                    </button>
                  </>
                )}
              </p>
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
                <Ticket className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />
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

              {/* Ticket List — shadow on outer wrapper so it is not clipped */}
              <div
                className="mx-0.5 rounded-[var(--radius-lg)] sm:mx-2"
                style={{ boxShadow: POLISH_THEME.feedListFloatShadow }}
              >
                <div
                  className="relative overflow-hidden rounded-[var(--radius-lg)]"
                  style={{
                    background: POLISH_THEME.listBg,
                    border: `1px solid ${POLISH_THEME.listBorder}`,
                    borderTop: `1px solid var(--color-feed-accent-border)`,
                  }}
                >
                {ticketsLoading ? (
                  <table className={POLISH_CLASS.feedTable}>
                    <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
                    <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
                    <TicketsTableSkeletonRows count={5} showIdColumn={showTicketIdColumn} />
                  </table>
                ) : tickets.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-2`}>
                    <Ticket className="h-8 w-8" style={{ color: 'var(--color-text-muted)' }} />
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {viewTab === 'active'
                        ? 'No active tickets for this location.'
                        : 'No completed tickets for this location.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <TicketFeedSelectionRail selectedId={selectedTicketId}>
                      <table className={POLISH_CLASS.feedTable}>
                        <TicketFeedColgroup showIdColumn={showTicketIdColumn} />
                        <TicketFeedThead showIdColumn={showTicketIdColumn} onToggleIdColumn={toggleTicketIdColumn} />
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
                                onRemoveTag={canAddTag ? handleRemoveTag : undefined}
                                removingTagId={
                                  removeTagMut.isPending &&
                                  removeTagMut.variables?.ticketId === ticket.id
                                    ? removeTagMut.variables.tagId
                                    : null
                                }
                                isAddingTag={
                                  addTagMut.isPending && addTagMut.variables?.ticketId === ticket.id
                                }
                                commentCount={ticket._count?.comments ?? 0}
                                completedSubtasks={completedSubtasks}
                                totalSubtasks={totalSubtasks}
                                requesterDisplayName={ticketRequesterPrimaryLine(ticket.requester)}
                                requesterEmail={ticketRequesterEmail(ticket.requester)}
                                isSelected={selectedTicketId === ticket.id}
                                showIdColumn={showTicketIdColumn}
                                onSelect={handleSelect}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </TicketFeedSelectionRail>
                    {totalPages > 1 && (
                      <FeedPaginationBar
                        page={page}
                        pageSize={PAGE_SIZE}
                        total={ticketsTotal}
                        isBusy={ticketsFetching}
                        onPrev={() => setPage((p) => Math.max(1, p - 1))}
                        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                      />
                    )}
                  </>
                )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <TicketDrawer
        ticketId={selectedTicketId}
        onClose={handleCloseDrawer}
        feedTicketIds={feedTicketIds}
        onNavigateTicket={setSelectedTicketId}
      />
    </div>
  );
}
