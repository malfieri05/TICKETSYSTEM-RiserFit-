import { Injectable } from '@nestjs/common';
import { RequestUser } from '../../modules/auth/strategies/jwt.strategy';

const TTL_MS = 60_000; // 60 seconds — deactivation takes effect within 1 min

interface Entry {
  user: RequestUser;
  expiresAt: number;
}

/**
 * Short-TTL cache for JWT validate() to avoid a DB lookup on every request.
 * Invalidated when a user is deactivated so deactivation is respected within TTL.
 */
@Injectable()
export class UserCacheService {
  private readonly cache = new Map<string, Entry>();

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
}
