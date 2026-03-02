import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { Prisma } from '@prisma/client';
import { SseChannel } from './channels/sse.channel';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private sseChannel: SseChannel,
  ) {}

  /**
   * Fetch paginated notifications for the current user.
   * Unread count is returned separately for the UI badge.
   */
  async findForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      data: notifications,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Mark a single notification as read. */
  async markRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) return null;

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /** Mark ALL notifications for a user as read (e.g. "Mark all as read" button). */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { count: result.count };
  }

  /**
   * Create an in-app notification record + push it over SSE.
   * Called by the fan-out processor for each user who should be notified.
   */
  async createAndDeliver(params: {
    userId: string;
    ticketId?: string;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        ticketId: params.ticketId,
        eventType: params.eventType as any,
        title: params.title,
        body: params.body,
        metadata: params.metadata as unknown as Prisma.InputJsonValue | undefined,
      },
    });

    // Push real-time over SSE if user has an active connection
    this.sseChannel.push(params.userId, {
      id: notification.id,
      type: params.eventType,
      title: params.title,
      body: params.body,
      ticketId: params.ticketId,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  /** Get the current user's notification preferences. */
  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { eventType: 'asc' },
    });
  }

  /** Upsert a single notification preference. */
  async setPreference(
    userId: string,
    eventType: string,
    channels: { email?: boolean; inApp?: boolean; teams?: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId, eventType: eventType as any } },
      create: {
        userId,
        eventType: eventType as any,
        channelEmail: channels.email ?? true,
        channelInApp: channels.inApp ?? true,
        channelTeams: channels.teams ?? false,
      },
      update: {
        ...(channels.email !== undefined && { channelEmail: channels.email }),
        ...(channels.inApp !== undefined && { channelInApp: channels.inApp }),
        ...(channels.teams !== undefined && { channelTeams: channels.teams }),
      },
    });
  }
}
