import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => {
    const variantStyles: Record<string, React.CSSProperties> = {
      primary: { background: 'var(--color-accent)', color: '#ffffff' },
      secondary: { background: 'var(--color-btn-secondary-bg)', color: 'var(--color-btn-secondary-text)', border: '1px solid var(--color-btn-secondary-border)' },
      ghost: { background: 'transparent', color: 'var(--color-btn-ghost-text)' },
      danger: { background: 'var(--color-danger)', color: '#ffffff' },
    };
    const hoverHandlers = {
      primary: {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-accent)'; },
      },
      secondary: {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-btn-secondary-hover)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-btn-secondary-bg)'; },
      },
      ghost: {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-btn-ghost-hover-bg)'; e.currentTarget.style.color = 'var(--color-btn-ghost-hover-text)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-btn-ghost-text)'; },
      },
      danger: {
        onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-danger-hover)'; },
        onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--color-danger)'; },
      },
    };
    const handlers = hoverHandlers[variant] ?? {};
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'px-2.5 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-5 py-2.5 text-base': size === 'lg',
          },
          className,
        )}
        style={variantStyles[variant]}
        {...handlers}
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
