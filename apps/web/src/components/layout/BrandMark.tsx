import { cn } from '@/lib/utils';

type BrandMarkSize = 'sm' | 'md' | 'lg';

const sizeStyles: Record<BrandMarkSize, string> = {
  /** Sidebar rail */
  sm: 'h-8 w-8 text-[0.9375rem] rounded-md',
  /** Login hero */
  md: 'h-12 w-12 text-xl rounded-md',
  /** Assistant welcome hero */
  lg: 'h-14 w-14 text-2xl rounded-xl',
};

/**
 * Rounded-square brand tile (not circular). Replaces circular PNG mark for consistent UI shape.
 */
export function BrandMark({ size = 'sm', className }: { size?: BrandMarkSize; className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center font-bold leading-none text-white select-none',
        sizeStyles[size],
        className,
      )}
      style={{ background: 'var(--color-accent)' }}
      aria-hidden
    >
      R
    </div>
  );
}
