export const QUEUES = {
  NOTIFICATION_FANOUT: 'notification-fanout',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  DEAD_LETTER: 'dead-letter',
  SCHEDULED: 'scheduled-jobs',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ─── Job Payloads ───────────────────────────────────────────────────────────

export interface FanOutJobData {
  eventType: string;
  ticketId: string;
  actorId: string;
  payload: Record<string, unknown>;
  occurredAt: string; // ISO timestamp
}

export interface DispatchJobData {
  notificationDeliveryId: string;
  channel: 'EMAIL' | 'IN_APP' | 'TEAMS';
  notificationId: string;
}

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string;
  originalData: unknown;
  failureReason: string;
  failedAt: string;
}

// ─── Queue Options ───────────────────────────────────────────────────────────

export const FANOUT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

export const DISPATCH_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 200,
  removeOnFail: 500,
};
