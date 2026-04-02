'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BrandMark } from '@/components/layout/BrandMark';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedOk = searchParams.get('invited') === '1';

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoMessage, setSsoMessage] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!name.trim()) { setError('Full name is required.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    }

    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login({ email, password })
        : await authApi.register({ email, name: name.trim(), password });

      login(res.data.access_token, res.data.user);

      const role = res.data.user.role;
      if (role === 'DEPARTMENT_USER') {
        router.push('/tickets');
      } else if (role === 'STUDIO_USER') {
        router.push('/portal');
      } else {
        router.push('/tickets');
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string }; status?: number }; message?: string; code?: string };
      const msg = ax?.response?.data?.message;
      if (typeof msg === 'string') {
        setError(msg);
      } else if (ax?.response?.status === 401 || ax?.response?.status === 400) {
        setError(mode === 'login' ? 'Invalid email or password.' : 'Could not create account. Please try again.');
      } else {
        const hint = !ax?.response ? ' Check that the API is running and CORS allows this origin.' : '';
        setError(
          mode === 'login'
            ? `Sign-in failed.${hint}`
            : `Could not create account.${hint}`,
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: 'var(--color-bg-page)' }}>
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="md" />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Riser Fitness</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Internal support ticketing system</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl p-8 space-y-5" style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)' }}>
          {invitedOk && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: 'var(--color-success)' }}>
              Your account is ready. Sign in with the password you set.
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {mode === 'login'
                ? 'Welcome back. Enter your credentials to continue.'
                : 'Fill in your details to get started.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <Input
                id="name"
                type="text"
                label="Full name"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            )}

            <Input
              id="email"
              type="email"
              label="Email address"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={mode === 'login'}
            />

            <Input
              id="password"
              type="password"
              label="Password"
              placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {mode === 'register' && (
              <Input
                id="confirmPassword"
                type="password"
                label="Confirm password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            )}

            {error && (
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={loading}>
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full" style={{ borderTop: '1px solid var(--color-border-default)' }} />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3" style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)' }}>or</span>
            </div>
          </div>

          {/* Microsoft SSO button */}
          <button
            type="button"
            onClick={() => setSsoMessage(true)}
            className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)]"
            style={{ background: 'var(--color-bg-surface-raised)', border: '1px solid var(--color-border-default)' }}
          >
            {/* Microsoft logo SVG */}
            <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </button>

          {/* SSO not-configured message */}
          {ssoMessage && (
            <div className="rounded-lg px-4 py-3" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
              <p className="text-sm text-indigo-300 font-medium">SSO not yet configured</p>
              <p className="text-xs text-indigo-400 mt-1">
                Microsoft Single Sign-On is available and ready to enable. Contact your system
                administrator to connect your organisation's Azure AD tenant.
              </p>
              <button
                type="button"
                onClick={() => setSsoMessage(false)}
                className="text-xs text-indigo-400 underline mt-2 hover:text-indigo-200"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[var(--color-text-muted)]">
          New accounts are by invitation only. If you need access, ask an administrator.
        </p>
      </div>
    </div>
  );
}
