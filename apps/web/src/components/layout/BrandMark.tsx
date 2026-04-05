import { cn } from '@/lib/utils';

type BrandMarkSize = 'sm' | 'md' | 'lg';

const sizeStyles: Record<BrandMarkSize, string> = {
  /** Sidebar rail (+40% vs previous 32px tile) */
  sm: 'h-[2.8rem] w-[2.8rem] text-[1.3125rem] rounded-lg',
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
