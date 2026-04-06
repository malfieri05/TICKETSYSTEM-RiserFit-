export const QUEUES = {
  NOTIFICATION_FANOUT: 'notification-fanout',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
  DEAD_LETTER: 'dead-letter',
  SCHEDULED: 'scheduled-jobs',
  KNOWLEDGE_INGESTION: 'knowledge-ingestion',
  EMAIL_INGEST: 'email-ingest',
  INVITE_EMAIL: 'invite-email',
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

export interface KnowledgeIngestionJobData {
  documentId: string;
}

export interface InviteEmailJobData {
  to: string;
  inviteLink: string;
  seedName: string;
}

// ─── Queue Options ───────────────────────────────────────────────────────────

export const FANOUT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
  timeout: 30_000, // 30s — fan-out is fast DB work; hanging beyond this is a bug
};

export const DISPATCH_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 200,
  removeOnFail: 500,
  timeout: 30_000, // 30s — external calls (Postmark, Teams) must resolve promptly
};

export const KNOWLEDGE_INGESTION_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
  timeout: 120_000, // 2m — embedding large docs can take time; still must not hang
};

export const EMAIL_INGEST_JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 50,
  removeOnFail: 100,
  timeout: 60_000, // 60s — Gmail fetch + parse; generous but bounded
};

export const INVITE_EMAIL_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 100,
  removeOnFail: 200,
  timeout: 30_000, // 30s — single transactional email send
};
