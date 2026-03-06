import { Injectable } from '@nestjs/common';

const TTL_MS = 45_000; // 45 seconds

interface Entry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Short-TTL cache for GET /tickets/my-summary to reduce DB load on repeated dashboard loads.
 * Invalidated when the user's tickets change (create, assign, watch).
 */
@Injectable()
export class MySummaryCacheService {
  private readonly cache = new Map<string, Entry<unknown>>();

  get<T>(userId: string): T | null {
    const entry = this.cache.get(userId) as Entry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(userId);
      return null;
    }
    return entry.data;
  }

  set<T>(userId: string, data: T): void {
    this.cache.set(userId, {
      data,
      expiresAt: Date.now() + TTL_MS,
    });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
