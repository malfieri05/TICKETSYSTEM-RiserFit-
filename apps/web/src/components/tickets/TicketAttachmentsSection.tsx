'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachmentsApi } from '@/lib/api';
import type { Attachment } from '@/types';
import { POLISH_THEME } from '@/lib/polish';
import { UploadDropzone } from '@/components/uploads/UploadDropzone';
import { AttachmentRow } from '@/components/tickets/AttachmentRow';

interface TicketAttachmentsSectionProps {
  ticketId: string;
  canManage: boolean;
  variant?: 'detail' | 'drawer';
}

export function TicketAttachmentsSection({
  ticketId,
  canManage,
  variant = 'detail',
}: TicketAttachmentsSectionProps) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: attachmentsRes } = useQuery({
    queryKey: ['ticket', ticketId, 'attachments'],
    queryFn: () => attachmentsApi.list(ticketId),
  });
  const attachments: Attachment[] = attachmentsRes?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.delete(attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket', ticketId, 'attachments'] });
    },
  });

  const handleDownload = async (attachment: Attachment) => {
    try {
      const res = await attachmentsApi.getDownloadUrl(attachment.id);
      window.open(res.data.downloadUrl, '_blank');
    } catch {
      // swallow; optional toast could be added later
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of files) {
        try {
          await attachmentsApi.upload(ticketId, file);
          qc.invalidateQueries({ queryKey: ['ticket', ticketId, 'attachments'] });
        } catch (err) {
          setUploadError(
            err instanceof Error
              ? err.message
              : `Upload failed for ${file.name}. Please try again.`,
          );
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const description =
    'Files are stored securely and visible to users who can see this ticket. Max 25MB per file.';

  return (
    <div
      className="dashboard-card rounded-xl overflow-hidden"
      style={{
        background:
          variant === 'drawer'
            ? POLISH_THEME.listBg
            : 'var(--color-bg-surface)',
        border: `1px solid ${
          variant === 'drawer'
            ? POLISH_THEME.innerBorder
            : 'var(--color-border-default)'
        }`,
      }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          borderBottom: `1px solid ${
            variant === 'drawer'
              ? POLISH_THEME.innerBorder
              : 'var(--color-border-default)'
          }`,
        }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: POLISH_THEME.metaDim }}
        >
          Attachments
        </span>
        <span
          className="text-[11px]"
          style={{ color: POLISH_THEME.metaMuted }}
        >
          Max 25MB per file
        </span>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-3">
        <UploadDropzone
          label="Upload file"
          description={description}
          multiple
          onFilesSelected={uploadFiles}
        />

        {uploading && (
          <div className="flex items-center gap-2 text-sm">
            <div className="animate-spin h-4 w-4 rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Uploading…
            </span>
          </div>
        )}

        {uploadError && (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: 'var(--color-danger-hover)',
            }}
          >
            {uploadError}
          </div>
        )}

        {attachments.length === 0 && !uploading && (
          <p
            className="text-sm"
            style={{ color: POLISH_THEME.metaDim }}
          >
            No attachments yet.
          </p>
        )}

        {attachments.length > 0 && (
          <div
            className="rounded-lg overflow-hidden"
            style={{
              background: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            {attachments.map((att, idx) => (
              <AttachmentRow
                key={att.id}
                attachment={att}
                canManage={canManage}
                variant={variant}
                onDownload={handleDownload}
                onDelete={
                  canManage
                    ? (id) => {
                        deleteMutation.mutate(id);
                      }
                    : undefined
                }
                showDivider={idx > 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

