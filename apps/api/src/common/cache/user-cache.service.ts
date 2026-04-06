import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RequestUser } from '../../modules/auth/strategies/jwt.strategy';

const TTL_MS = 60_000; // 60 seconds — deactivation takes effect within 1 min
const SWEEP_INTERVAL_MS = 60_000; // sweep expired entries every 60s

interface Entry {
  user: RequestUser;
  expiresAt: number;
}

/**
 * Short-TTL cache for JWT validate() to avoid a DB lookup on every request.
 * Invalidated when a user is deactivated so deactivation is respected within TTL.
 * A periodic sweep evicts entries that expired without being accessed,
 * preventing unbounded Map growth over long-running processes.
 */
@Injectable()
export class UserCacheService implements OnModuleDestroy {
  private readonly cache = new Map<string, Entry>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Prevent the timer from keeping Node alive if the process is shutting down
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  get(userId: string): RequestUser | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(userId);
      return null;
    }
    return entry.user;
  }

  set(userId: string, user: RequestUser): void {
    this.cache.set(userId, {
      user,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  /** Remove all entries whose TTL has passed. Runs on a periodic interval. */
  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }
}
