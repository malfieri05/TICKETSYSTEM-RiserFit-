'use client';

import { useEffect, useState } from 'react';

const DEFAULT_MS = 300;

/**
 * Returns a value that updates only after the input has been stable for `delayMs`.
 * Use for search/filter inputs to avoid excessive refetches.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = DEFAULT_MS): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
