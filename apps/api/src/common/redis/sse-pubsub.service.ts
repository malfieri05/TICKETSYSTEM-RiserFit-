import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Redis = require('ioredis');

const REDIS_CHANNEL_PREFIX = 'sse:user:';

export function sseUserChannel(userId: string): string {
  return `${REDIS_CHANNEL_PREFIX}${userId}`;
}

/**
 * Redis pub/sub for SSE multi-instance delivery.
 * One publisher connection and one subscriber connection per instance.
 * Reuses same Redis config as BullMQ (REDIS_HOST, REDIS_PORT, etc.).
 */
@Injectable()
export class SsePubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SsePubSubService.name);
  private publisher: InstanceType<typeof Redis> | null = null;
  private subscriber: InstanceType<typeof Redis> | null = null;
  private channelHandlers = new Map<string, Set<(message: string) => void>>();
  private _available = false;

  get available(): boolean {
    return this._available;
  }

  async onModuleInit(): Promise<void> {
    const config = this.getRedisConfig();
    try {
      this.publisher = new Redis(config);
      this.subscriber = new Redis(config);

      this.subscriber.on('message', (channel: string, message: string) => {
        this.channelHandlers.get(channel)?.forEach((h) => h(message));
      });

      this.subscriber.on('connect', () => {
        const channels = Array.from(this.channelHandlers.keys());
        if (channels.length > 0) {
          this.subscriber!.subscribe(...channels).catch((err: Error) =>
            this.logger.warn('Redis SSE re-subscribe failed', err?.message),
          );
        }
      });

      const connectTimeoutMs = 3000;
      await Promise.race([
        Promise.all([
          new Promise<void>((resolve, reject) => {
            this.publisher!.once('ready', () => resolve());
            this.publisher!.once('error', reject);
          }),
          new Promise<void>((resolve, reject) => {
            this.subscriber!.once('ready', () => resolve());
            this.subscriber!.once('error', reject);
          }),
        ]),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis SSE connection timeout')),
            connectTimeoutMs,
          ),
        ),
      ]);
      this._available = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis SSE pub/sub not available: ${msg}`);
      this._available = false;
      this.cleanup();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this._available = false;
    this.cleanup();
  }

  private getRedisConfig(): {
    host: string;
    port: number;
    password?: string;
    tls?: object;
  } {
    return {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
      ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
    };
  }

  private cleanup(): void {
    if (this.publisher) {
      this.publisher.disconnect();
      this.publisher = null;
    }
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    this.channelHandlers.clear();
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.publisher || !this._available) return;
    try {
      await this.publisher.publish(channel, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis SSE publish failed: ${msg}`);
    }
  }

  subscribe(channel: string, handler: (message: string) => void): void {
    if (!this.subscriber || !this._available) return;
    let set = this.channelHandlers.get(channel);
    if (!set) {
      set = new Set();
      this.channelHandlers.set(channel, set);
      this.subscriber.subscribe(channel).catch((err: Error) =>
        this.logger.warn('Redis SSE subscribe failed', err?.message),
      );
    }
    set.add(handler);
  }

  unsubscribe(channel: string): void {
    this.channelHandlers.delete(channel);
    if (this.subscriber && this._available) {
      this.subscriber.unsubscribe(channel).catch((err: Error) =>
        this.logger.warn('Redis SSE unsubscribe failed', err?.message),
      );
    }
  }
}
