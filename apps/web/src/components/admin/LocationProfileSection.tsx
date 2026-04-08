'use client';

import { ChevronDown } from 'lucide-react';
import { POLISH_THEME } from '@/lib/polish';

export function LocationProfileSection({
  title,
  icon: Icon,
  open,
  onToggle,
  headerActions,
  children,
}: {
  title: string;
  icon: React.ElementType;
  open: boolean;
  onToggle: () => void;
  /** Edit / Cancel / Save — rendered on the header row; clicks do not toggle the section. */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="dashboard-card overflow-hidden rounded-xl border"
      style={{
        background: POLISH_THEME.listBg,
        borderColor: POLISH_THEME.listBorder,
      }}
    >
      <div
        className="flex w-full items-stretch border-b"
        style={{
          borderColor: POLISH_THEME.listBorder,
          background: POLISH_THEME.feedTheadBg,
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left"
        >
          <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            {title}
          </h3>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform duration-300"
            style={{
              color: 'var(--color-text-muted)',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          />
        </button>
        {headerActions != null && (
          <div
            className="flex shrink-0 items-center gap-2 border-l px-3 py-2"
            style={{ borderColor: POLISH_THEME.listBorder }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {headerActions}
          </div>
        )}
      </div>
      <div
        className="grid workspace-collapsible-grid"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 py-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
