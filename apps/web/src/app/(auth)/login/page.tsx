'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authApi.devLogin(email);
      login(res.data.access_token, res.data.user);
      router.push('/tickets');
    } catch {
      setError('Login failed. Check your email and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Ticket className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HelpDesk</h1>
            <p className="text-sm text-gray-500 mt-1">Internal support ticketing system</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Sign in</h2>
            <p className="text-sm text-gray-500 mt-1">Enter your company email to continue</p>
          </div>

          <Input
            id="email"
            type="email"
            label="Email address"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Sign in
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400">
          SSO login will be enabled once your identity provider is configured.
        </p>
      </div>
    </div>
  );
}
