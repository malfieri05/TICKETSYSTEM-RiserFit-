import { Injectable, OnModuleDestroy } from '@nestjs/common';

const TTL_MS = 45_000;          // entry is "fresh" for 45s
const STALE_MS = 15_000;        // serve stale for an extra 15s while revalidating
const SWEEP_INTERVAL_MS = 60_000;

interface Entry<T> {
  data: T;
  expiresAt: number;      // end of fresh window
  staleUntil: number;     // end of stale-while-revalidate window
  revalidating: boolean;  // guard to prevent thundering herd on stale hits
}

/**
 * Short-TTL cache for GET /tickets/my-summary to reduce DB load on repeated dashboard loads.
 * Invalidated when the user's tickets change (create, assign, watch).
 *
 * Stale-while-revalidate: when an entry is past TTL but within the stale window,
 * the cached value is returned immediately (preventing a thundering herd on restart)
 * and the caller's revalidate callback is invoked once in the background.
 *
 * A periodic sweep evicts fully-expired entries to prevent unbounded Map growth.
 */
@Injectable()
export class MySummaryCacheService implements OnModuleDestroy {
  private readonly cache = new Map<string, Entry<unknown>>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  /**
   * Returns the cached value if fresh.
   * If stale-but-within-window, returns the stale value AND calls `revalidate` once in background.
   * If fully expired or missing, returns null (caller must fetch synchronously).
   */
  get<T>(userId: string, revalidate?: () => Promise<T>): T | null {
    const entry = this.cache.get(userId) as Entry<T> | undefined;
    if (!entry) return null;

    const now = Date.now();

    if (now <= entry.expiresAt) {
      return entry.data; // fresh hit
    }

    if (now <= entry.staleUntil) {
      // Stale-while-revalidate: serve the old value immediately
      if (revalidate && !entry.revalidating) {
        entry.revalidating = true;
        revalidate()
          .then((fresh) => this.set(userId, fresh))
          .catch(() => { entry.revalidating = false; }); // reset so it can retry
      }
      return entry.data;
    }

    // Fully expired
    this.cache.delete(userId);
    return null;
  }

  set<T>(userId: string, data: T): void {
    const now = Date.now();
    this.cache.set(userId, {
      data,
      expiresAt: now + TTL_MS,
      staleUntil: now + TTL_MS + STALE_MS,
      revalidating: false,
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.staleUntil) this.cache.delete(key);
    }
  }
}
