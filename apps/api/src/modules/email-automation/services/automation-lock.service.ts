import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Lock keyed by (orderNumber + vendor). Prevents duplicate ticket creation when cron runs overlap.
 */
@Injectable()
export class AutomationLockService {
  private readonly logger = new Logger(AutomationLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  buildLockKey(orderNumber: string, vendorIdentifier: string): string {
    return `${orderNumber}|${vendorIdentifier}`;
  }

  /**
   * Acquire lock. Returns true if acquired, false if already held by another run.
   * Expired or released locks are removed and a new lock is created.
   */
  async acquire(orderNumber: string, vendorIdentifier: string): Promise<boolean> {
    const lockKey = this.buildLockKey(orderNumber, vendorIdentifier);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);

    const existing = await this.prisma.emailAutomationLock.findUnique({
      where: { lockKey },
    });
    if (existing) {
      if (existing.releasedAt != null || existing.expiresAt < now) {
        await this.prisma.emailAutomationLock.delete({ where: { lockKey } });
      } else {
        this.logger.debug(`Lock already held for ${lockKey}`);
        return false;
      }
    }

    await this.prisma.emailAutomationLock.create({
      data: { lockKey, expiresAt, releasedAt: null },
    });
    return true;
  }

  /**
   * Release lock by setting releasedAt.
   */
  async release(orderNumber: string, vendorIdentifier: string): Promise<void> {
    const lockKey = this.buildLockKey(orderNumber, vendorIdentifier);
    await this.prisma.emailAutomationLock.updateMany({
      where: { lockKey, releasedAt: null },
      data: { releasedAt: new Date() },
    });
  }

  /**
   * Remove expired or already-released locks to avoid table growth. Safe to call periodically (e.g. each ingest run).
   */
  async purgeExpiredOrReleasedLocks(): Promise<number> {
    const now = new Date();
    const result = await this.prisma.emailAutomationLock.deleteMany({
      where: {
        OR: [{ releasedAt: { not: null } }, { expiresAt: { lt: now } }],
      },
    });
    if (result.count > 0) {
      this.logger.debug(`Purged ${result.count} expired or released automation lock(s)`);
    }
    return result.count;
  }
}
