import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, CSSProperties, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outlineAccent';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variantConfig: Record<string, { bg: string; hoverBg: string; color: string; border?: string; hoverColor?: string }> = {
  primary:   { bg: 'var(--color-accent)', hoverBg: 'var(--color-accent-hover)', color: '#ffffff' },
  secondary: { bg: 'var(--color-btn-secondary-bg)', hoverBg: 'var(--color-btn-secondary-hover)', color: 'var(--color-btn-secondary-text)', border: '1px solid var(--color-btn-secondary-border)' },
  ghost:     { bg: 'transparent', hoverBg: 'var(--color-btn-ghost-hover-bg)', color: 'var(--color-btn-ghost-text)', hoverColor: 'var(--color-btn-ghost-hover-text)' },
  danger:    { bg: 'var(--color-danger)', hoverBg: 'var(--color-danger-hover)', color: '#ffffff' },
  /** Outlined reset action — red border + text (Clear filters in toolbars). */
  outlineAccent: {
    bg: 'transparent',
    hoverBg: 'var(--color-btn-ghost-hover-bg)',
    color: 'var(--color-danger)',
    hoverColor: 'var(--color-danger-hover)',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, style, ...props }, ref) => {
    const cfg = variantConfig[variant] ?? variantConfig.primary;
    const cssVars = {
      '--btn-bg': cfg.bg,
      '--btn-hover-bg': cfg.hoverBg,
      '--btn-color': cfg.color,
      '--btn-hover-color': cfg.hoverColor ?? cfg.color,
    } as CSSProperties;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-[var(--duration-fast)] ease-out',
          'focus-ring active:translate-y-[0.5px] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0',
          'bg-[var(--btn-bg)] text-[var(--btn-color)] hover:bg-[var(--btn-hover-bg)] hover:text-[var(--btn-hover-color)]',
          variant === 'outlineAccent' &&
            'border border-solid border-[var(--color-danger)] hover:border-[var(--color-danger-hover)]',
          {
            'px-2.5 h-8 text-sm': size === 'sm',
            'px-4 h-9 text-sm': size === 'md',
            'px-5 h-10 text-base': size === 'lg',
          },
          className,
        )}
        style={{ ...cssVars, border: cfg.border, ...style }}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
