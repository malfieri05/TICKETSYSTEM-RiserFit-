'use client';

import { useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { invitationsPublicApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type Phase = 'init' | 'loading' | 'invalid' | 'ready';

const GENERIC_INVALID = 'This invitation link is invalid or has expired. Ask your administrator for a new invite.';

export default function InviteAcceptPage() {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>('init');
  const [summary, setSummary] = useState<{
    emailMasked: string;
    roleLabel: string;
    name: string;
    scopeSummary: string;
    expiresAt: string;
  } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || startedRef.current) return;
    startedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('token');
    if (fromUrl) tokenRef.current = fromUrl;
    window.history.replaceState({}, '', '/invite/accept');

    const run = async () => {
      const token = tokenRef.current;
      if (!token) {
        setPhase('invalid');
        return;
      }
      setPhase('loading');
      try {
        const { data } = await invitationsPublicApi.validate(token);
        if (!data.valid) {
          tokenRef.current = null;
          setPhase('invalid');
          return;
        }
        setSummary({
          emailMasked: data.emailMasked,
          roleLabel: data.roleLabel,
          name: data.name,
          scopeSummary: data.scopeSummary,
          expiresAt: data.expiresAt,
        });
        setPhase('ready');
      } catch {
        tokenRef.current = null;
        setPhase('invalid');
      }
    };
    void run();
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError('');
      const token = tokenRef.current;
      if (!token || !summary) return;
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }
      setSubmitting(true);
      try {
        await invitationsPublicApi.accept(token, password);
        tokenRef.current = null;
        router.replace('/login?invited=1');
      } catch {
        setFormError('Could not complete setup. Try again or request a new invitation.');
      } finally {
        setSubmitting(false);
      }
    },
    [password, confirmPassword, summary, router],
  );

  return (
    <div
      className="flex min-h-dvh w-full items-center justify-center px-4 py-10"
      data-auth-canvas
    >
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Accept Invitation
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Set your password to finish creating your account.
          </p>
        </div>

        {(phase === 'init' || phase === 'loading') && (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
          </div>
        )}

        {phase === 'invalid' && (
          <div
            className="rounded-xl p-6 text-sm"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
          >
            {GENERIC_INVALID}
          </div>
        )}

        {phase === 'ready' && summary && (
          <div
            className="rounded-xl p-6 space-y-4"
            style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}
          >
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Name</dt>
                <dd style={{ color: 'var(--color-text-primary)' }}>{summary.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Email</dt>
                <dd style={{ color: 'var(--color-text-primary)' }}>{summary.emailMasked}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Role</dt>
                <dd style={{ color: 'var(--color-text-primary)' }}>{summary.roleLabel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Access</dt>
                <dd style={{ color: 'var(--color-text-primary)' }}>{summary.scopeSummary}</dd>
              </div>
            </dl>

            <form onSubmit={onSubmit} className="space-y-3 pt-2">
              <Input
                id="inv-pw"
                type="password"
                label="Password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <Input
                id="inv-pw2"
                type="password"
                label="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
              <Button type="submit" className="w-full" size="lg" loading={submitting} disabled={submitting}>
                Create account
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
