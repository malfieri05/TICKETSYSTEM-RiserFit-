'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { emailAutomationApi } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

export default function EmailDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;

  const { data: email, isLoading } = useQuery({
    queryKey: ['email-automation', 'email', id],
    queryFn: async () => (await emailAutomationApi.getEmail(id)).data,
    enabled: !!id,
  });

  const reprocessMut = useMutation({
    mutationFn: () => emailAutomationApi.reprocessEmail(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-automation', 'email', id] });
      qc.invalidateQueries({ queryKey: ['email-automation'] });
    },
  });

  if (isLoading || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-root)' }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--color-text-muted)' }} />
      </div>
    );
  }

  const e = email as {
    id: string;
    messageId: string;
    subject: string | null;
    fromAddress: string | null;
    receivedAt: string;
    bodyPlain: string | null;
    classification: string | null;
    classificationConfidence: number | null;
    processedAt: string | null;
    vendorOrderRecords?: unknown[];
    deliveryEvents?: unknown[];
    reviewItems?: unknown[];
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-root)' }}>
      <Header title="Email detail" />
      <main className="p-6 max-w-4xl mx-auto">
        <Link
          href="/admin/email-automation"
          className="inline-flex items-center gap-2 text-sm mb-6"
          style={{ color: 'var(--color-accent)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Email Automation
        </Link>

        <div className="space-y-4 mb-6">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {e.subject ?? '(no subject)'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            From: {e.fromAddress ?? '—'} · Received {formatDistanceToNow(new Date(e.receivedAt), { addSuffix: true })}
          </p>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Classification: {e.classification ?? '—'} (confidence: {e.classificationConfidence ?? '—'}) · Processed: {e.processedAt ? formatDistanceToNow(new Date(e.processedAt), { addSuffix: true }) : '—'}
          </p>
        </div>

        <Button
          onClick={() => reprocessMut.mutate()}
          disabled={reprocessMut.isPending}
        >
          {reprocessMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reprocess email
        </Button>
        {reprocessMut.isSuccess && (
          <p className="text-sm mt-2" style={{ color: 'var(--color-text-muted)' }}>
            Result: {reprocessMut.data?.data?.classification} → {reprocessMut.data?.data?.outcome}
          </p>
        )}

        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Body (plain)</h2>
          <pre
            className="p-4 rounded-lg overflow-auto max-h-96 text-xs whitespace-pre-wrap"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-muted)',
            }}
          >
            {e.bodyPlain ?? '(no body)'}
          </pre>
        </div>

        {(e.vendorOrderRecords?.length ?? 0) > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Linked orders</h2>
            <pre className="text-xs p-4 rounded-lg" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
              {JSON.stringify(e.vendorOrderRecords, null, 2)}
            </pre>
          </div>
        )}
        {(e.deliveryEvents?.length ?? 0) > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Delivery events</h2>
            <pre className="text-xs p-4 rounded-lg" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
              {JSON.stringify(e.deliveryEvents, null, 2)}
            </pre>
          </div>
        )}
        {(e.reviewItems?.length ?? 0) > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>Review items</h2>
            <pre className="text-xs p-4 rounded-lg" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
              {JSON.stringify(e.reviewItems, null, 2)}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
