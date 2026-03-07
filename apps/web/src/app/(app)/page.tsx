'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

/** Root app redirect: STUDIO_USER → /portal, others → /tickets. */
export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === 'STUDIO_USER') {
      router.replace('/portal');
    } else if (user) {
      router.replace('/tickets');
    }
  }, [user, router]);

  // Brief loading while auth resolves
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#000000' }}>
      <div className="animate-spin h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
    </div>
  );
}
