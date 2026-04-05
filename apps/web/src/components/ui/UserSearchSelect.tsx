'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UserOption {
  id: string;
  displayName: string;
  email: string;
}

export interface UserSearchSelectProps {
  /** List of users to search (e.g. from usersApi.list()). */
  users: UserOption[];
  /** Selected user id, or empty string for none. */
  value: string;
  /** Called when selection changes. */
  onChange: (userId: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Optional: restrict to a subset (e.g. department users). Filter applied before search. */
  filter?: (u: UserOption) => boolean;
  /** Position of the suggestions list relative to the input. Default 'below'. */
  dropdownPosition?: 'above' | 'below';
}

const defaultFilter = () => true;

/**
 * Searchable people picker for assigning a user. Matches on displayName and email.
 * Shows selected user with clear; otherwise search input with filtered dropdown.
 */
export function UserSearchSelect({
  users,
  value,
  onChange,
  label,
  placeholder = 'Search by name or email…',
  className,
  filter = defaultFilter,
  dropdownPosition = 'below',
}: UserSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const eligible = useMemo(() => users.filter(filter), [users, filter]);
  const selectedUser = useMemo(() => eligible.find((u) => u.id === value) ?? null, [eligible, value]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible.slice(0, 20);
    return eligible.filter(
      (u) =>
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q),
    ).slice(0, 20);
  }, [eligible, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showDropdown = isOpen && (query.length > 0 || !selectedUser);
  const displayName = selectedUser ? (selectedUser.displayName || selectedUser.email) : '';

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(false);
  };

  const handleSelect = (user: UserOption) => {
    onChange(user.id);
    setQuery('');
    setIsOpen(false);
  };

  const handleFocus = () => {
    if (!selectedUser) setIsOpen(true);
    else setQuery('');
  };

  const handleBlur = () => {
    // Delay so click on dropdown item registers
    setTimeout(() => setIsOpen(false), 150);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-1 relative', className)}>
      {label && (
        <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <div
        className={cn(
          'relative flex items-center rounded-lg border-2 border-solid border-[var(--color-border-default)] text-sm',
          'transition-[border-color] duration-[var(--duration-fast)] ease-out',
          'focus-within:border-[var(--color-accent)]',
        )}
        style={{
          background: 'var(--color-bg-surface)',
        }}
      >
        {selectedUser ? (
          <>
            <div className="flex-1 min-w-0 flex items-center gap-2 pl-3 py-2 pr-8">
              <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>
                {displayName}
              </span>
              {selectedUser.email && selectedUser.email !== displayName && (
                <span className="hidden sm:inline truncate text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedUser.email}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 p-1 rounded transition-colors hover:text-[var(--color-text-primary)]"
              style={{ color: 'var(--color-text-muted)' }}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <Search className="absolute left-3 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full pl-9 pr-3 py-2 bg-transparent rounded-lg focus:outline-none placeholder:opacity-70"
              style={{ color: 'var(--color-text-primary)' }}
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-haspopup="listbox"
            />
          </>
        )}
      </div>

      {showDropdown && (
        <ul
          className={cn(
            'absolute left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-lg border py-1',
            dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
          style={{
            background: 'var(--color-bg-surface-raised)',
            borderColor: 'var(--color-border-default)',
            boxShadow: 'var(--shadow-raised)',
          }}
          role="listbox"
        >
          {filteredUsers.length === 0 ? (
            <li className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }} role="option">
              No matching users
            </li>
          ) : (
            filteredUsers.map((u) => (
              <li
                key={u.id}
                role="option"
                className="mx-1 flex flex-col gap-0.5 rounded-md px-3 py-2 cursor-pointer transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-row-selected)]"
                style={{ color: 'var(--color-text-primary)' }}
                onClick={() => handleSelect(u)}
              >
                <span className="font-medium truncate">{u.displayName || u.email}</span>
                {u.email && u.email !== (u.displayName || '') && (
                  <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{u.email}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
