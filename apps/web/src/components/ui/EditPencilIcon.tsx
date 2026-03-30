import { cn } from '@/lib/utils';

/**
 * Geometric edit pencil: ~45° diagonal, tip lower-left, longer skinny shaft, gap, compact eraser.
 * Color via `className` (e.g. text-blue-600) and fill="currentColor".
 */
export function EditPencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 shrink-0', className)}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <g transform="rotate(-45 12 12)">
        {/* Narrow eraser, same width as shaft */}
        <rect x="9.5" y="3" width="5" height="3" />
        {/* Gap y 6–7; shaft longer + narrower than before */}
        <rect x="9.5" y="7" width="5" height="9.75" />
        {/* Triangular tip — matches 5px shaft width */}
        <polygon points="9.5,16.75 14.5,16.75 12,21" />
      </g>
    </svg>
  );
}
