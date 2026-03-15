'use client';

import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Paperclip, Download, Trash2 } from 'lucide-react';
import type { Attachment } from '@/types';

interface AttachmentRowProps {
  attachment: Attachment;
  canManage: boolean;
  variant?: 'detail' | 'drawer';
  onDownload: (attachment: Attachment) => void;
  onDelete?: (id: string) => void;
  showDivider?: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function AttachmentRow({
  attachment,
  canManage,
  variant = 'detail',
  onDownload,
  onDelete,
  showDivider,
}: AttachmentRowProps) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer transition-colors duration-150 hover:bg-[var(--color-bg-surface-raised)]"
      style={
        showDivider
          ? { borderTop: '1px solid var(--color-border-default)' }
          : undefined
      }
      onClick={() => onDownload(attachment)}
    >
      <Paperclip
        className="h-4 w-4 shrink-0"
        style={{ color: 'var(--color-text-muted)' }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {attachment.filename}
        </p>
        <p
          className="text-xs"
          style={{
            color:
              variant === 'drawer'
                ? 'var(--color-text-secondary)'
                : 'var(--color-text-muted)',
          }}
        >
          {attachment.uploadedBy?.name ?? '—'} &mdash;{' '}
          {formatDistanceToNow(new Date(attachment.createdAt), {
            addSuffix: true,
          })}{' '}
          &mdash; {formatBytes(attachment.sizeBytes)}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDownload(attachment);
        }}
        className="p-1.5 rounded transition-colors duration-150 hover:text-[var(--color-accent)]"
        style={{ color: 'var(--color-text-muted)' }}
        title="Download"
      >
        <Download className="h-4 w-4" />
      </button>
      {canManage && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(attachment.id);
          }}
          className="p-1.5 rounded transition-colors duration-150 hover:text-red-600"
          style={{ color: 'var(--color-text-muted)' }}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </button>
  );
}

