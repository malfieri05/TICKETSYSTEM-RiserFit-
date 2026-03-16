'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Mail,
  Settings,
  List,
  MapPin,
  Inbox,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
  Play,
  Plus,
  Trash2,
  Check,
  X,
  FlaskConical,
  Link2,
  Unlink,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { emailAutomationApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

type TabId = 'config' | 'assembly' | 'addresses' | 'review' | 'emails' | 'events' | 'playground';

const TABS: { id: TabId; label: string; icon: typeof Settings }[] = [
  { id: 'config', label: 'Config', icon: Settings },
  { id: 'assembly', label: 'Assembly trigger list', icon: List },
  { id: 'addresses', label: 'Normalized addresses', icon: MapPin },
  { id: 'review', label: 'Review queue', icon: AlertCircle },
  { id: 'emails', label: 'Inbound emails', icon: Inbox },
  { id: 'events', label: 'Event log', icon: Clock },
  { id: 'playground', label: 'Email Pattern Playground', icon: FlaskConical },
];

export default function EmailAutomationPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>('config');

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-root)' }}>
      <Header title="Email Automation" />
      <main className="p-6 max-w-6xl mx-auto">
        <div className="flex gap-2 border-b mb-6" style={{ borderColor: 'var(--color-border-default)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
              style={{
                background: tab === id ? 'var(--color-bg-surface)' : 'transparent',
                color: tab === id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                borderBottom: tab === id ? '2px solid var(--color-accent)' : '2px solid transparent',
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'config' && <ConfigTab qc={qc} />}
        {tab === 'assembly' && <AssemblyTab qc={qc} />}
        {tab === 'addresses' && <AddressesTab qc={qc} />}
        {tab === 'review' && <ReviewTab qc={qc} />}
        {tab === 'emails' && <EmailsTab qc={qc} />}
        {tab === 'events' && <EventsTab />}
        {tab === 'playground' && <PlaygroundTab />}
      </main>
    </div>
  );
}

function ConfigTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const searchParams = useSearchParams();
  const { data: config, isLoading } = useQuery({
    queryKey: ['email-automation', 'config'],
    queryFn: async () => (await emailAutomationApi.getConfig()).data,
  });
  const [form, setForm] = useState({
    gmailLabel: '',
    gmailPollWindowHours: 24,
    isEnabled: false,
    minOrderNumberConfidence: 0.8,
    minAddressConfidence: 0.8,
    minItemConfidence: 0.8,
  });
  const [gmailMessage, setGmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const updateMut = useMutation({
    mutationFn: (data: Parameters<typeof emailAutomationApi.updateConfig>[0]) =>
      emailAutomationApi.updateConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'config'] }),
  });
  const ingestMut = useMutation({
    mutationFn: () => emailAutomationApi.runIngest(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation'] }),
  });
  const connectGmailMut = useMutation({
    mutationFn: async () => {
      const { data } = await emailAutomationApi.getGmailAuthUrl();
      window.location.href = data.url;
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      const msg = err?.response?.data?.message ?? 'Failed to get Gmail auth URL';
      setGmailMessage({ type: 'error', text: msg });
    },
  });
  const disconnectGmailMut = useMutation({
    mutationFn: () => emailAutomationApi.gmailDisconnect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-automation', 'config'] });
      setGmailMessage(null);
    },
  });

  useEffect(() => {
    const connected = searchParams.get('gmail_connected');
    const error = searchParams.get('gmail_error');
    if (connected === '1') {
      setGmailMessage({ type: 'success', text: 'Gmail connected successfully.' });
      window.history.replaceState({}, '', '/admin/email-automation');
    } else if (error) {
      setGmailMessage({ type: 'error', text: decodeURIComponent(error) });
      window.history.replaceState({}, '', '/admin/email-automation');
    }
  }, [searchParams]);

  useEffect(() => {
    if (config) {
      setForm({
        gmailLabel: config.gmailLabel ?? '',
        gmailPollWindowHours: config.gmailPollWindowHours,
        isEnabled: config.isEnabled,
        minOrderNumberConfidence: config.minOrderNumberConfidence,
        minAddressConfidence: config.minAddressConfidence,
        minItemConfidence: config.minItemConfidence,
      });
    }
  }, [config]);

  if (isLoading || !config) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading config…
      </div>
    );
  }

  const current = {
    gmailLabel: config.gmailLabel ?? '',
    gmailPollWindowHours: config.gmailPollWindowHours,
    isEnabled: config.isEnabled,
    minOrderNumberConfidence: config.minOrderNumberConfidence,
    minAddressConfidence: config.minAddressConfidence,
    minItemConfidence: config.minItemConfidence,
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            Gmail connection
          </span>
          {config.gmailConnectedEmail ? (
            <>
              <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Connected as {config.gmailConnectedEmail}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => disconnectGmailMut.mutate()}
                disabled={disconnectGmailMut.isPending}
              >
                {disconnectGmailMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => connectGmailMut.mutate()}
              disabled={connectGmailMut.isPending}
            >
              {connectGmailMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Connect Gmail
            </Button>
          )}
        </div>
        {gmailMessage && (
          <p
            className="text-sm py-2 px-3 rounded-lg"
            style={{
              color: gmailMessage.type === 'error' ? 'var(--color-danger)' : 'var(--color-text-primary)',
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            {gmailMessage.text}
          </p>
        )}
        <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Gmail label (optional)
        </label>
        <Input
          value={form.gmailLabel || current.gmailLabel}
          onChange={(e) => setForm((f) => ({ ...f, gmailLabel: e.target.value }))}
          placeholder="INBOX or label name"
        />
        <label className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          Poll window (hours)
        </label>
        <Input
          type="number"
          min={1}
          max={168}
          value={form.gmailPollWindowHours ?? current.gmailPollWindowHours}
          onChange={(e) => setForm((f) => ({ ...f, gmailPollWindowHours: parseInt(e.target.value, 10) || 24 }))}
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isEnabled ?? current.isEnabled}
            onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
          />
          <span className="text-sm" style={{ color: 'var(--color-text-primary)' }}>Enable automation</span>
        </label>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Confidence thresholds: order {current.minOrderNumberConfidence}, address {current.minAddressConfidence}, item {current.minItemConfidence}. Edit in API if needed.
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() =>
            updateMut.mutate({
              gmailLabel: form.gmailLabel || null,
              gmailPollWindowHours: form.gmailPollWindowHours,
              isEnabled: form.isEnabled,
            })
          }
          disabled={updateMut.isPending}
        >
          {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save config'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => ingestMut.mutate()}
          disabled={ingestMut.isPending}
        >
          {ingestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run ingest now
        </Button>
      </div>
    </div>
  );
}

function AssemblyTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['email-automation', 'assembly-items'],
    queryFn: async () => (await emailAutomationApi.listAssemblyItems()).data,
  });
  const [newKeyword, setNewKeyword] = useState('');
  const createMut = useMutation({
    mutationFn: (keyword: string) =>
      emailAutomationApi.createAssemblyItem({ keywordOrPhrase: keyword }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'assembly-items'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => emailAutomationApi.deleteAssemblyItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'assembly-items'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          placeholder="Keyword or phrase"
          className="max-w-xs"
        />
        <Button
          onClick={() => {
            if (newKeyword.trim()) {
              createMut.mutate(newKeyword.trim());
              setNewKeyword('');
            }
          }}
          disabled={createMut.isPending || !newKeyword.trim()}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
        {(items ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2">
            <span style={{ color: 'var(--color-text-primary)' }}>
              {item.keywordOrPhrase}
              {item.displayName && (
                <span className="text-sm ml-2" style={{ color: 'var(--color-text-muted)' }}>
                  ({item.displayName})
                </span>
              )}
              <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
                {item.matchMode} · {item.isActive ? 'Active' : 'Inactive'}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMut.mutate(item.id)}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddressesTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: addresses, isLoading } = useQuery({
    queryKey: ['email-automation', 'normalized-addresses'],
    queryFn: async () => (await emailAutomationApi.listNormalizedAddresses()).data,
  });
  const refreshMut = useMutation({
    mutationFn: () => emailAutomationApi.refreshNormalizedAddresses(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'normalized-addresses'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={() => refreshMut.mutate()}
        disabled={refreshMut.isPending}
      >
        {refreshMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh from studios
      </Button>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {addresses?.length ?? 0} normalized address(es). Refresh builds from Studio formatted addresses.
      </p>
      <ul className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
        {(addresses ?? []).map((a) => (
          <li key={a.id} className="py-2">
            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{a.studio?.name ?? a.studioId}</span>
            <p className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>{a.normalizedAddress}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['email-automation', 'review-queue'],
    queryFn: async () => (await emailAutomationApi.listReviewQueue()).data,
  });
  const resolveMut = useMutation({
    mutationFn: (id: string) => emailAutomationApi.resolveReviewItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'review-queue'] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => emailAutomationApi.dismissReviewItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automation', 'review-queue'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
        {(items ?? []).map((item: { id: string; reason: string; status: string; email?: { id: string; subject: string | null }; createdAt: string }) => (
          <li key={item.id} className="py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.reason}</span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{item.status}</span>
            </div>
            {item.email && (
              <Link
                href={`/admin/email-automation/emails/${item.email.id}`}
                className="text-sm underline"
                style={{ color: 'var(--color-accent)' }}
              >
                {item.email.subject ?? item.email.id}
              </Link>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </p>
            {item.status === 'PENDING' && (
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={() => resolveMut.mutate(item.id)} disabled={resolveMut.isPending}>
                  <Check className="h-4 w-4" /> Resolve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dismissMut.mutate(item.id)} disabled={dismissMut.isPending}>
                  <X className="h-4 w-4" /> Dismiss
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmailsTab({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const [page, setPage] = useState(1);
  const { data: res, isLoading } = useQuery({
    queryKey: ['email-automation', 'emails', page],
    queryFn: async () => (await emailAutomationApi.listEmails({ page, limit: 20 })).data,
  });
  const emails = Array.isArray(res) ? res : (res as { id: string; messageId: string; subject: string | null; fromAddress: string | null; receivedAt: string; classification: string | null; processedAt: string | null }[]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
        {(emails ?? []).map((email: { id: string; subject: string | null; fromAddress: string | null; receivedAt: string; classification: string | null; processedAt: string | null }) => (
          <li key={email.id} className="py-2">
            <Link
              href={`/admin/email-automation/emails/${email.id}`}
              className="block hover:underline"
              style={{ color: 'var(--color-text-primary)' }}
            >
              {email.subject ?? '(no subject)'}
            </Link>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {email.fromAddress} · {email.classification ?? '—'} · {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function EventsTab() {
  const { data: events, isLoading } = useQuery({
    queryKey: ['email-automation', 'events'],
    queryFn: async () => (await emailAutomationApi.listEvents({ limit: 50 })).data,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
      {(events ?? []).map((ev: { id: string; eventType: string; emailId: string; createdAt: string }) => (
        <li key={ev.id} className="py-2 text-sm">
          <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>{ev.eventType}</span>
          <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>email {ev.emailId.slice(0, 8)}…</span>
          <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlaygroundTab() {
  const [rawEmail, setRawEmail] = useState('');
  const mutation = useMutation({
    mutationFn: () => emailAutomationApi.emailPatternPlayground({ rawEmail }),
  });
  const result = mutation.data?.data;

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Paste a raw email (subject + body). Optionally start with a line <code>Subject: ...</code> and/or <code>From: ...</code>. No data is saved.
      </p>
      <textarea
        value={rawEmail}
        onChange={(e) => setRawEmail(e.target.value)}
        placeholder="Subject: Your order has been delivered\nFrom: orders@vendor.com\n\nOrder #12345 was delivered to..."
        className="w-full h-40 p-3 rounded-lg text-sm font-mono"
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          color: 'var(--color-text-primary)',
        }}
      />
      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !rawEmail.trim()}
      >
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
        Run preview
      </Button>
      {result && (
        <div className="p-4 rounded-lg text-sm space-y-3" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          <p><strong>Classification:</strong> {result.classification.type} (confidence: {result.classification.confidence})</p>
          {result.extractedOrder && (
            <p><strong>Order:</strong> #{result.extractedOrder.orderNumber}, vendor {result.extractedOrder.vendorIdentifier}, confidences: order {result.extractedOrder.orderNumberConfidence}, address {result.extractedOrder.addressConfidence}, item {result.extractedOrder.itemConfidence}</p>
          )}
          {result.extractedDelivery && (
            <p><strong>Delivery:</strong> order #{result.extractedDelivery.orderNumber}, timestamp {result.extractedDelivery.deliveryTimestamp ?? '—'}</p>
          )}
          {result.assemblyMatch && (
            <p><strong>Assembly match:</strong> {result.assemblyMatch.matched ? `Yes (${result.assemblyMatch.matchedKeywords.join(', ')})` : 'No'}</p>
          )}
          {result.studioMatch && (
            <p><strong>Studio match:</strong> {result.studioMatch.kind === 'single' ? `Studio ${result.studioMatch.studioId}` : result.studioMatch.kind === 'ambiguous' ? `Ambiguous (${result.studioMatch.studioIds.length} studios)` : 'None'}</p>
          )}
        </div>
      )}
    </div>
  );
}
