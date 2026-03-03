import { cn } from '@/lib/utils';
import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600',
            'focus:outline-none focus:ring-1 focus:ring-teal-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: '#111111', border: '1px solid #2a2a2a' }}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, id, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-300">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-lg px-3 py-2 text-sm text-gray-100',
            'focus:outline-none focus:ring-1 focus:ring-teal-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: '#111111', border: '1px solid #2a2a2a', colorScheme: 'dark' }}
          {...props}
        >
          {children}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
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
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-300">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={id}
          className={cn(
            'block w-full rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-y',
            'focus:outline-none focus:ring-1 focus:ring-teal-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'ring-1 ring-red-500',
            className,
          )}
          style={{ background: '#111111', border: '1px solid #2a2a2a' }}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
