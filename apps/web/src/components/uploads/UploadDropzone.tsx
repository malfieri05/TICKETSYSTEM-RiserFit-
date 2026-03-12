'use client';

import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface UploadDropzoneProps {
  label?: string;
  description?: string;
  maxSizeBytes?: number;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
}

const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024;

export function UploadDropzone({
  label = 'Click or drag to upload',
  description,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  multiple = false,
  onFilesSelected,
}: UploadDropzoneProps) {
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const asArray = Array.from(files);
      const accepted: File[] = [];
      for (const file of asArray) {
        if (file.size > maxSizeBytes) {
          setError('File must be smaller than 25MB.');
          continue;
        }
        accepted.push(file);
      }
      if (accepted.length > 0) {
        setError(null);
        onFilesSelected(accepted);
      }
    },
    [maxSizeBytes, onFilesSelected],
  );

  const onDrop: React.DragEventHandler<HTMLElement> = (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files?.length) return;
    handleFiles(multiple ? e.dataTransfer.files : [e.dataTransfer.files[0]]);
  };

  const onChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    handleFiles(multiple ? files : [files[0]]);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      {description && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
      )}
      <label
        className="flex flex-col items-center justify-center gap-2 rounded-lg p-4 cursor-pointer border-2 border-dashed transition-colors duration-150"
        style={{ borderColor: 'var(--color-border-default)', background: 'var(--color-bg-surface)' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <Upload className="h-6 w-6" style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Click to select file{multiple ? 's' : ''} or drag and drop
        </span>
        <input
          type="file"
          className="hidden"
          multiple={multiple}
          onChange={onChange}
        />
      </label>
      {error && (
        <p className="text-xs" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}
    </div>
  );
}

