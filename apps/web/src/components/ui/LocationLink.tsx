'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationLinkProps {
  studioId: string;
  studioName: string;
  className?: string;
  showIcon?: boolean;
}

export function LocationLink({ studioId, studioName, className, showIcon = false }: LocationLinkProps) {
  return (
    <Link
      href={`/locations/${studioId}`}
      className={cn(
        'inline-flex items-center gap-1 hover:underline',
        'text-[var(--color-accent)] hover:text-[var(--color-accent)]',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {showIcon && <MapPin className="h-3 w-3 shrink-0" />}
      <span className="truncate">{studioName}</span>
    </Link>
  );
}
