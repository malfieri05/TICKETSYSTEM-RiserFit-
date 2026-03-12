'use client';

import type { ReactNode } from 'react';
import { POLISH_THEME, POLISH_CLASS } from '@/lib/polish';

export type InboxFolder = {
  id: string;
  label: string;
  activeCount?: number;
};

export interface InboxLayoutProps {
  title: string;
  description?: string;
  folders?: InboxFolder[];
  selectedFolderId?: string;
  onFolderChange?: (id: string) => void;
  /** Vertical = sidebar list (e.g. department topics). Horizontal = chip row above filters. */
  folderOrientation?: 'vertical' | 'horizontal';
  /** Optional filter bar rendered above the list (search, status, etc.). */
  filters?: ReactNode;
  /** When true, show initial loading (spinner or skeleton). When false, show list/empty. */
  isInitialLoading: boolean;
  /** When true and we have tickets, show subtle "Fetching…" indicator without clearing the list. */
  isFetching?: boolean;
  /** Whether there is at least one ticket to render. */
  hasTickets: boolean;
  /** Ticket list markup (rows or table body). */
  ticketList: ReactNode;
  /** Empty state markup when there are no tickets. */
  emptyState: ReactNode;
  /** Optional pagination controls rendered below the list. */
  pagination?: ReactNode;
  /** Optional skeleton to show during initial load (avoids full spinner). */
  initialSkeleton?: ReactNode;
}

export function InboxLayout({
  title,
  description,
  folders,
  selectedFolderId,
  onFolderChange,
  folderOrientation = 'horizontal',
  filters,
  isInitialLoading,
  isFetching = false,
  hasTickets,
  ticketList,
  emptyState,
  pagination,
  initialSkeleton,
}: InboxLayoutProps) {
  const hasFolders = folders != null && folders.length > 0;

  const renderFolderButton = (folder: InboxFolder) => {
    const isActive = folder.id === selectedFolderId;
    return (
      <button
        key={folder.id}
        type="button"
        onClick={() => onFolderChange?.(folder.id)}
        className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2"
        style={{
          background: isActive ? 'rgba(52,120,196,0.15)' : 'transparent',
          color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          border: isActive ? '1px solid rgba(52,120,196,0.4)' : '1px solid transparent',
        }}
      >
        <span className="truncate">{folder.label}</span>
        {folder.activeCount != null && (
          <span
            className="shrink-0 text-xs tabular-nums"
            style={{ color: isActive ? POLISH_THEME.accent : POLISH_THEME.metaDim }}
          >
            {folder.activeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {hasFolders && folderOrientation === 'vertical' && (
        <aside
          className="w-52 shrink-0 flex flex-col border-r"
          style={{ borderColor: POLISH_THEME.listBorder, background: 'var(--color-bg-surface)' }}
        >
          <div className="p-3 border-b" style={{ borderColor: POLISH_THEME.listBorder }}>
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: POLISH_THEME.metaMuted }}
            >
              Topics
            </span>
          </div>
          <nav className="p-2 space-y-0.5 overflow-y-auto">
            {folders!.map(renderFolderButton)}
          </nav>
        </aside>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className={`max-w-5xl mx-auto ${POLISH_CLASS.sectionGap}`}>
          {/* Local header */}
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h2>
            {description && (
              <p className="text-xs mt-1" style={{ color: POLISH_THEME.metaMuted }}>
                {description}
              </p>
            )}
          </div>

          {/* Horizontal folders strip (chips) */}
          {hasFolders && folderOrientation === 'horizontal' && (
            <div className="flex flex-wrap gap-2">
              {folders!.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onFolderChange?.(folder.id)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background:
                      folder.id === selectedFolderId
                        ? 'rgba(52,120,196,0.15)'
                        : 'transparent',
                    color: folder.id === selectedFolderId ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    border:
                      folder.id === selectedFolderId
                        ? '1px solid rgba(52,120,196,0.4)'
                        : '1px solid var(--color-border-default)',
                  }}
                >
                  <span>{folder.label}</span>
                  {folder.activeCount != null && (
                    <span className="ml-1 text-[11px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {folder.activeCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          {filters && <div>{filters}</div>}

          {/* List container */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: POLISH_THEME.listBg, border: `1px solid ${POLISH_THEME.listBorder}`, boxShadow: POLISH_THEME.listContainerShadow }}
          >
            {isInitialLoading ? (
              initialSkeleton ?? (
                <div className={`flex flex-col items-center justify-center ${POLISH_CLASS.emptyStatePadding} gap-2`}>
                  <div className="animate-spin h-6 w-6 rounded-full border-4 border-[var(--color-accent)] border-t-transparent" />
                  <span className="text-xs" style={{ color: POLISH_THEME.metaMuted }}>
                    Loading…
                  </span>
                </div>
              )
            ) : !hasTickets ? (
              emptyState
            ) : (
              <>
                {isFetching && (
                  <div
                    className="px-4 py-1.5 flex items-center gap-2 border-b"
                    style={{ borderColor: POLISH_THEME.listBorder, background: POLISH_THEME.listBgHeader }}
                  >
                    <div className="animate-spin h-3 w-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                    <span className="text-xs" style={{ color: POLISH_THEME.metaMuted }}>
                      Fetching…
                    </span>
                  </div>
                )}
                {ticketList}
                {pagination}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

