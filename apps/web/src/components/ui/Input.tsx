import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Raised shadow for filter bars (search, etc.) */
  elevated?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, elevated, className, id, ...props }, ref) => {
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
            'focus-ring block h-9 w-full rounded-[var(--radius-md)] px-3 text-sm placeholder:text-[var(--color-text-muted)] placeholder:opacity-100',
            'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            elevated && 'filter-elevated-shadow',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
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
  ({ label, error, elevated, className, id, children, ...props }, ref) => {
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
            'focus-ring block h-9 w-full rounded-[var(--radius-md)] px-3 text-sm',
            'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            elevated && 'filter-elevated-shadow',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
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
  ({ label, error, className, id, ...props }, ref) => {
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
            'focus-ring block w-full rounded-[var(--radius-md)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] placeholder:opacity-100 resize-y',
            'transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-input-border)', color: 'var(--color-text-primary)' }}
          {...props}
        />
        {error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
