import { cn } from '@/lib/utils';
import { POLISH_CLASS } from '@/lib/polish';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Raised shadow for filter bars (search, etc.) */
  elevated?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, elevated, className, id, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium leading-none" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            elevated
              ? cn(
                  'block w-full box-border placeholder:text-[var(--color-text-muted)] placeholder:opacity-100',
                  POLISH_CLASS.filterBarControl,
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'filter-elevated-shadow',
                  error && 'ring-1 ring-red-500',
                )
              : cn(
                  'block h-9 w-full box-border rounded-[var(--radius-md)] border-2 border-solid border-[var(--color-input-border)] px-3 text-sm',
                  'placeholder:text-[var(--color-text-muted)] placeholder:opacity-100',
                  'outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
                  'focus-visible:border-[var(--color-accent)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  error && 'border-red-500 focus-visible:border-red-500',
                ),
            className,
          )}
          style={{
            ...(elevated
              ? { background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }
              : { background: 'var(--color-input-bg)', color: 'var(--color-text-primary)' }),
            ...style,
          }}
          {...props}
        />
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  elevated?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, elevated, className, id, children, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium leading-none" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            elevated
              ? cn(
                  'block w-full box-border',
                  POLISH_CLASS.filterBarControl,
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'filter-elevated-shadow',
                  error && 'ring-1 ring-red-500',
                )
              : cn(
                  'block h-9 w-full box-border rounded-[var(--radius-md)] border-2 border-solid border-[var(--color-input-border)] px-3 text-sm',
                  'outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
                  'focus-visible:border-[var(--color-accent)]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  error && 'border-red-500 focus-visible:border-red-500',
                ),
            className,
          )}
          style={{
            ...(elevated
              ? { background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }
              : { background: 'var(--color-input-bg)', color: 'var(--color-text-primary)' }),
            ...style,
          }}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, style, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium leading-none" style={{ color: 'var(--color-text-secondary)' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'block w-full box-border rounded-[var(--radius-md)] border-2 border-solid border-[var(--color-input-border)] px-3 py-2 text-sm',
            'placeholder:text-[var(--color-text-muted)] placeholder:opacity-100 resize-y',
            'outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
            'focus-visible:border-[var(--color-accent)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-red-500 focus-visible:border-red-500',
            className,
          )}
          style={{ background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', ...style }}
          {...props}
        />
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
