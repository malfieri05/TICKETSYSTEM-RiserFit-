'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ticket-feed-show-id-column';

/**
 * Ticket ID column visibility for canonical feeds. Default collapsed (hidden);
 * preference persisted in localStorage.
 */
export function useTicketFeedIdColumnVisible(): [boolean, () => void] {
  const [showIdColumn, setShowIdColumn] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '1' || v === 'true') setShowIdColumn(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleIdColumn = useCallback(() => {
    setShowIdColumn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [showIdColumn, toggleIdColumn];
}
