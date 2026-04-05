'use client';

import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadDropzoneProps {
  /** Omit or pass empty string to hide the label row (e.g. when the parent already has a heading). */
  label?: string;
  description?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  /** e.g. ".pdf,application/pdf" — enforced for both picker and drag-and-drop */
  accept?: string;
  /** Main line inside the dashed box (e.g. "Click to select a PDF file") */
  selectPrompt?: string;
  /** Subline under the main prompt */
  secondaryPrompt?: string;
  onFilesSelected: (files: File[]) => void;
}

const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

function fileMatchesAccept(file: File, accept: string | undefined): boolean {
  if (!accept?.trim()) return true;
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  for (const t of tokens) {
    if (t === 'application/pdf' && file.type === 'application/pdf') return true;
    if (t.startsWith('.') && file.name.toLowerCase().endsWith(t)) return true;
    if (t.includes('/') && file.type.toLowerCase() === t) return true;
  }
  return false;
}

export function UploadDropzone({
  label,
  description,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  multiple = false,
  accept,
  selectPrompt,
  secondaryPrompt,
  onFilesSelected,
}: UploadDropzoneProps) {
  const [error, setError] = useState<string | null>(null);
  /** Nested dragenter/dragleave on children toggles depth; avoids flicker. */
  const [fileDragDepth, setFileDragDepth] = useState(0);
  const isFileOver = fileDragDepth > 0;
  const maxMb = Math.max(1, Math.round(maxSizeBytes / (1024 * 1024)));
  const resolvedLabel = label === undefined ? 'Click or drag to upload' : label;

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const asArray = Array.from(files);
      const accepted: File[] = [];
      for (const file of asArray) {
        if (file.size > maxSizeBytes) {
          setError(`File must be smaller than ${maxMb} MB.`);
          continue;
        }
        if (!fileMatchesAccept(file, accept)) {
          setError('This file type is not allowed.');
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length > 0) {
        setError(null);
        onFilesSelected(accepted);
      }
    },
    [accept, maxMb, maxSizeBytes, onFilesSelected],
  );

  const onDrop: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragDepth(0);
    if (!e.dataTransfer.files?.length) return;
    handleFiles(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]]);
  };

  const onDragEnter: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes('Files')) return;
    setFileDragDepth((d) => d + 1);
  };

  const onDragLeave: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setFileDragDepth((d) => Math.max(0, d - 1));
  };

  const onDragOver: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if ([...e.dataTransfer.types].includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    handleFiles(multiple ? files : [files[0]]);
  };

  const showLabel = resolvedLabel.trim().length > 0;
  const mainPrompt =
    selectPrompt ?? `Click to select file${multiple ? 's' : ''}`;
  const subPrompt = secondaryPrompt ?? 'or drag and drop here';
  const dropPrompt = multiple ? 'Drop files to upload' : 'Drop file to upload';

  return (
    <div className="space-y-2">
      {showLabel && (
        <span className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {resolvedLabel}
        </span>
      )}
      {description && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
      )}
      <label
        className={cn(
          'flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-lg px-4 py-8 cursor-pointer border-2 border-dashed transition-all duration-200 ease-out',
          isFileOver
            ? 'scale-[1.02] border-[var(--color-accent)]'
            : 'border-[var(--color-border-default)] bg-[var(--color-bg-root)] hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-surface-raised)]',
        )}
        style={
          isFileOver
            ? {
                background: 'color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-root))',
                boxShadow:
                  '0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
              }
            : undefined
        }
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <Upload
          className={`h-9 w-9 shrink-0 transition-transform duration-200 ${isFileOver ? 'scale-110' : ''}`}
          strokeWidth={1.5}
          style={{ color: 'var(--color-accent)' }}
          aria-hidden
        />
        <span className="text-center text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
          {isFileOver ? dropPrompt : mainPrompt}
        </span>
        <span className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {isFileOver ? 'Release to add' : subPrompt}
        </span>
        <input
          type="file"
          className="hidden"
          multiple={multiple}
          accept={accept}
          onChange={onChange}
        />
      </label>
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

