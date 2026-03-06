import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './common/database/database.module';
import { CacheModule } from './common/cache/cache.module';
import { AuditLogModule } from './common/audit-log/audit-log.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { CommentsModule } from './modules/comments/comments.module';
import { SubtasksModule } from './modules/subtasks/subtasks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WorkersModule } from './workers/workers.module';
import { AdminModule } from './modules/admin/admin.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { AiModule } from './modules/ai/ai.module';
import { AgentModule } from './modules/agent/agent.module';

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── BullMQ + Redis ────────────────────────────────────────────────────────
    // Configured globally — all BullModule.registerQueue() calls use this connection
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD,
        tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      },
    }),

    // ── Database + Cache ───────────────────────────────────────────────────────
    DatabaseModule,
    CacheModule,
    AuditLogModule,

    // ── Feature Modules ───────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    EventsModule,
    TicketsModule,
    CommentsModule,
    SubtasksModule,
    NotificationsModule,

    // ── Admin ─────────────────────────────────────────────────────────────────
    AdminModule,

    // ── Attachments ───────────────────────────────────────────────────────────
    AttachmentsModule,

    // ── Reporting ─────────────────────────────────────────────────────────────
    ReportingModule,

    // ── AI Assistant (RAG + pgvector) ─────────────────────────────────────────
    AiModule,

    // ── AI Agent (tool calling + action plans) ────────────────────────────────
    AgentModule,

    // ── Background Workers ────────────────────────────────────────────────────
    WorkersModule,
  ],
  providers: [
    // Apply JWT guard globally — all routes require auth by default
    // Use @Public() decorator on specific routes to opt out (e.g. /auth/callback)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apply roles guard globally — use @Roles() to restrict specific routes
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
