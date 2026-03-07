import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import {
  QUEUES,
  FanOutJobData,
  DISPATCH_JOB_OPTIONS,
} from '../../common/queue/queue.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Department, NotificationEventType } from '@prisma/client';

/** Max recipients per event to prevent notification storms. */
const MAX_RECIPIENTS_PER_EVENT = 200;

/**
 * Fan-out rules: which "roles" get notified for each event type.
 * 'requester' | 'owner' | 'watchers' | 'mentioned' | 'subtaskOwner' | 'departmentUsers'
 */
const FANOUT_RULES: Record<string, string[]> = {
  TICKET_CREATED: ['owner'],
  TICKET_ASSIGNED: ['owner'],
  TICKET_REASSIGNED: ['owner'],
  TICKET_STATUS_CHANGED: ['requester', 'watchers'],
  TICKET_RESOLVED: ['requester', 'watchers'],
  TICKET_CLOSED: ['requester', 'watchers'],
  COMMENT_ADDED: ['requester', 'owner', 'watchers'],
  MENTION_IN_COMMENT: ['mentioned'],
  SUBTASK_ASSIGNED: ['subtaskOwner'],
  SUBTASK_COMPLETED: ['owner'],
  SUBTASK_BLOCKED: ['owner'],
  SUBTASK_BECAME_READY: ['departmentUsers', 'subtaskOwner'],
  ATTACHMENT_ADDED: ['owner', 'watchers'],
};

/**
 * Notification titles + body templates per event type.
 */
function buildNotificationContent(
  eventType: string,
  payload: Record<string, unknown>,
): { title: string; body: string } {
  const ticketTitle = (payload.title as string) ?? 'a ticket';
  const actorName = (payload.authorName ?? payload.ownerName ?? 'Someone') as string;

  switch (eventType) {
    case 'TICKET_CREATED':
      return { title: 'New ticket created', body: `"${ticketTitle}" has been submitted.` };
    case 'TICKET_ASSIGNED':
      return { title: 'Ticket assigned to you', body: `"${ticketTitle}" has been assigned to you.` };
    case 'TICKET_REASSIGNED':
      return { title: 'Ticket reassigned to you', body: `"${ticketTitle}" has been reassigned to you.` };
    case 'TICKET_STATUS_CHANGED':
      return {
        title: 'Ticket status updated',
        body: `"${ticketTitle}" moved to ${payload.newStatus}.`,
      };
    case 'TICKET_RESOLVED':
      return { title: 'Ticket resolved', body: `"${ticketTitle}" has been resolved.` };
    case 'TICKET_CLOSED':
      return { title: 'Ticket closed', body: `"${ticketTitle}" has been closed.` };
    case 'COMMENT_ADDED':
      return {
        title: `${actorName} commented`,
        body: `On "${ticketTitle}": ${String(payload.bodyPreview ?? '').substring(0, 100)}`,
      };
    case 'MENTION_IN_COMMENT':
      return {
        title: `${actorName} mentioned you`,
        body: String(payload.bodyPreview ?? '').substring(0, 120),
      };
    case 'SUBTASK_ASSIGNED':
      return {
        title: 'Subtask assigned to you',
        body: `"${payload.subtaskTitle}" on ticket "${ticketTitle}"`,
      };
    case 'SUBTASK_COMPLETED':
      return {
        title: 'Subtask completed',
        body: `"${payload.subtaskTitle}" has been completed.`,
      };
    case 'SUBTASK_BLOCKED':
      return {
        title: 'Subtask blocked',
        body: `"${payload.subtaskTitle}" is now blocked.`,
      };
    case 'SUBTASK_BECAME_READY':
      return {
        title: "It's your turn",
        body: `"${payload.subtaskTitle}" on ticket "${ticketTitle}" is ready for you.`,
      };
    default:
      return { title: 'New notification', body: 'You have a new notification.' };
  }
}

@Processor(QUEUES.NOTIFICATION_FANOUT)
export class NotificationFanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationFanoutProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    @InjectQueue(QUEUES.NOTIFICATION_DISPATCH)
    private dispatchQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<FanOutJobData>): Promise<void> {
    const { eventType, ticketId, actorId, payload } = job.data;
    this.logger.debug(`Fan-out: ${eventType} for ticket ${ticketId}`);

    const rules = FANOUT_RULES[eventType] ?? [];
    if (rules.length === 0) return;

    // Load ticket + watchers
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        requesterId: true,
        ownerId: true,
        watchers: { select: { userId: true } },
      },
    });
    if (!ticket) {
      this.logger.warn(`Ticket ${ticketId} not found — skipping fan-out`);
      return;
    }

    // Build the set of user IDs to notify
    const recipientIds = new Set<string>();

    for (const rule of rules) {
      switch (rule) {
        case 'requester':
          if (ticket.requesterId) recipientIds.add(ticket.requesterId);
          break;
        case 'owner':
          if (ticket.ownerId) recipientIds.add(ticket.ownerId);
          break;
        case 'watchers':
          ticket.watchers.forEach((w) => recipientIds.add(w.userId));
          break;
        case 'mentioned':
          ((payload.mentionedUserIds as string[]) ?? []).forEach((id) =>
            recipientIds.add(id),
          );
          break;
        case 'subtaskOwner':
          if (payload.ownerId) recipientIds.add(payload.ownerId as string);
          break;
        case 'departmentUsers':
          if (payload.departmentId) {
            const dept = await this.prisma.taxonomyDepartment.findUnique({
              where: { id: payload.departmentId as string },
              select: { code: true },
            });
            if (dept?.code && Object.values(Department).includes(dept.code as Department)) {
              const userIdsInDept = await this.prisma.userDepartment.findMany({
                where: { department: dept.code as Department },
                select: { userId: true },
              });
              userIdsInDept.forEach((r) => recipientIds.add(r.userId));
            }
          }
          break;
      }
    }

    // Don't notify the actor who triggered the event
    recipientIds.delete(actorId);

    // Safety cap to prevent notification storms
    let recipientArray = Array.from(recipientIds);
    if (recipientArray.length > MAX_RECIPIENTS_PER_EVENT) {
      this.logger.warn(
        `Fan-out capped recipients from ${recipientArray.length} to ${MAX_RECIPIENTS_PER_EVENT} for ${eventType} ticket ${ticketId}`,
      );
      recipientArray = recipientArray.slice(0, MAX_RECIPIENTS_PER_EVENT);
    }

    if (recipientArray.length === 0) return;

    // Load users + their preferences
    const users = await this.prisma.user.findMany({
      where: { id: { in: recipientArray }, isActive: true },
      select: { id: true, email: true, name: true },
    });

    const preferences = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: users.map((u) => u.id) },
        eventType: eventType as NotificationEventType,
      },
    });

    const prefMap = new Map(preferences.map((p) => [p.userId, p]));
    const { title, body } = buildNotificationContent(eventType, {
      ...payload,
      title: ticket.title,
    });

    // Create notification + delivery records for each recipient
    for (const user of users) {
      const pref = prefMap.get(user.id);
      // Default: in-app = true, email = true, teams = false
      const wantsInApp = pref ? pref.channelInApp : true;
      const wantsEmail = pref ? pref.channelEmail : true;

      // Create the in-app notification record + push SSE
      if (wantsInApp) {
        await this.notificationsService.createAndDeliver({
          userId: user.id,
          ticketId,
          eventType,
          title,
          body,
          metadata: payload,
        });
      }

      // Create email delivery record and enqueue dispatch job
      if (wantsEmail) {
        const subtaskIdPart = (payload.subtaskId as string) ?? '';
        const idempotencyKey = `${eventType}_${ticketId}_${subtaskIdPart}_${user.id}_EMAIL_${job.data.occurredAt}`;

        // Check idempotency — don't create duplicate delivery record
        const existing = await this.prisma.notificationDelivery.findUnique({
          where: { idempotencyKey },
        });
        if (existing) continue;

        // Find the notification we just created (for the in-app record linkage)
        const notification = await this.prisma.notification.findFirst({
          where: { userId: user.id, ticketId, eventType: eventType as NotificationEventType },
          orderBy: { createdAt: 'desc' },
        });

        if (!notification) continue;

        const delivery = await this.prisma.notificationDelivery.create({
          data: {
            notificationId: notification.id,
            channel: 'EMAIL',
            status: 'PENDING',
            idempotencyKey,
          },
        });

        await this.dispatchQueue.add(
          `dispatch_email_${user.id}`,
          {
            notificationDeliveryId: delivery.id,
            channel: 'EMAIL',
            notificationId: notification.id,
          },
          {
            ...DISPATCH_JOB_OPTIONS,
            jobId: `dispatch_${delivery.id}`,
          },
        );
      }
    }

    this.logger.debug(
      `Fan-out complete: ${eventType} → ${users.length} recipients for ticket ${ticketId}`,
    );
  }
}
