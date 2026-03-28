import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';

import { DatabaseModule } from './common/database/database.module';
import { CacheModule } from './common/cache/cache.module';
import { AuditLogModule } from './common/audit-log/audit-log.module';
import { HealthModule } from './health/health.module';
import { RedisSseModule } from './common/redis/redis-sse.module';

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
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiModule } from './modules/ai/ai.module';
import { AgentModule } from './modules/agent/agent.module';
import { TicketFormsModule } from './modules/ticket-forms/ticket-forms.module';
import { SubtaskWorkflowModule } from './modules/subtask-workflow/subtask-workflow.module';
import { WorkflowAnalyticsModule } from './modules/workflow-analytics/workflow-analytics.module';
import { PolicyModule } from './policy/policy.module';
import { EmailAutomationModule } from './modules/email-automation/email-automation.module';
import { LeaseIQModule } from './modules/lease-iq/lease-iq.module';
import { DispatchModule } from './modules/dispatch/dispatch.module';
import { LocationsModule } from './modules/locations/locations.module';

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { RootController } from './root.controller';

@Module({
  controllers: [RootController],
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

    // ── Health (readiness + queue visibility) ──────────────────────────────────
    HealthModule,

    // ── Redis SSE (multi-instance real-time) ───────────────────────────────────
    RedisSseModule,

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

    // ── Dashboard (Stage 5) ──────────────────────────────────────────────────
    DashboardModule,

    // ── AI Assistant (RAG + pgvector) ─────────────────────────────────────────
    AiModule,

    // ── AI Agent (tool calling + action plans) ────────────────────────────────
    AgentModule,

    // ── Ticket forms (schema-driven) ──────────────────────────────────────────
    TicketFormsModule,

    // ── Subtask workflow (Stage 4 templates + dependencies) ───────────────────
    SubtaskWorkflowModule,
    WorkflowAnalyticsModule,
    PolicyModule,

    // ── Email automation (assembly ticket from delivery emails) ─────────────────
    EmailAutomationModule,

    // ── Lease IQ (per-studio lease responsibility rules + ticket evaluation) ─
    LeaseIQModule,

    // ── Dispatch Intelligence (V1) ────────────────────────────────────────────
    DispatchModule,

    // ── Location Profiles ──────────────────────────────────────────────────────
    LocationsModule,

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
