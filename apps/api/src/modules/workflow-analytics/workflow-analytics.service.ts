import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

const SATISFIED_STATUSES = ['DONE', 'SKIPPED'] as const;
const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class WorkflowAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplates(): Promise<
    {
      templateId: string;
      templateName: string | null;
      totalExecutions: number;
      activeExecutions: number;
      completedExecutions: number;
      avgCompletionTimeHours: number | null;
      mostRecentExecutionAt: string | null;
    }[]
  > {
    const templates = await this.prisma.subtaskWorkflowTemplate.findMany({
      select: {
        id: true,
        name: true,
        subtaskTemplates: { select: { id: true } },
      },
    });

    const result = await Promise.all(
      templates.map(async (t) => {
        const templateSubtaskIds = t.subtaskTemplates.map((s) => s.id);
        let totalExecutions = 0;
        let activeExecutions = 0;
        let completedExecutions = 0;
        let avgCompletionTimeHours: number | null = null;
        let mostRecentExecutionAt: string | null = null;

        if (templateSubtaskIds.length > 0) {
          const ticketGroups = await this.prisma.subtask.groupBy({
            by: ['ticketId'],
            where: { subtaskTemplateId: { in: templateSubtaskIds } },
          });
          const ticketIds = ticketGroups.map((r) => r.ticketId);
          totalExecutions = ticketIds.length;

          const ticketsWithActive = await this.prisma.subtask.findMany({
            where: {
              subtaskTemplateId: { in: templateSubtaskIds },
              isRequired: true,
              status: { notIn: [...SATISFIED_STATUSES] },
            },
            select: { ticketId: true },
            distinct: ['ticketId'],
          });
          const activeSet = new Set(ticketsWithActive.map((r) => r.ticketId));
          activeExecutions = activeSet.size;
          completedExecutions = totalExecutions - activeExecutions;

          if (ticketIds.length > 0) {
            const ticketsWithDates = await this.prisma.ticket.findMany({
              where: {
                id: { in: ticketIds },
                OR: [
                  { resolvedAt: { not: null } },
                  { closedAt: { not: null } },
                ],
              },
              select: { createdAt: true, resolvedAt: true, closedAt: true },
            });
            if (ticketsWithDates.length > 0) {
              const durations = ticketsWithDates.map((tk) => {
                const end = tk.resolvedAt ?? tk.closedAt!;
                return (end.getTime() - tk.createdAt.getTime()) / MS_PER_HOUR;
              });
              avgCompletionTimeHours =
                durations.reduce((a, b) => a + b, 0) / durations.length;
            }

            const latest = await this.prisma.ticket.findFirst({
              where: { id: { in: ticketIds } },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            });
            if (latest) mostRecentExecutionAt = latest.createdAt.toISOString();
          }
        }

        return {
          templateId: t.id,
          templateName: t.name,
          totalExecutions,
          activeExecutions,
          completedExecutions,
          avgCompletionTimeHours,
          mostRecentExecutionAt,
        };
      }),
    );

    return result;
  }

  async getDepartments(): Promise<
    {
      departmentId: string;
      departmentName: string;
      ticketsCreated: number;
      workflowsStarted: number;
      workflowsCompleted: number;
      avgWorkflowDurationHours: number | null;
    }[]
  > {
    const departments = await this.prisma.taxonomyDepartment.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    const result = await Promise.all(
      departments.map(async (dept) => {
        const ticketsCreated = await this.prisma.ticket.count({
          where: { departmentId: dept.id },
        });

        const ticketsWithSubtask = await this.prisma.subtask.findMany({
          where: {
            ticket: { departmentId: dept.id },
            subtaskTemplateId: { not: null },
          },
          select: { ticketId: true },
          distinct: ['ticketId'],
        });
        const workflowTicketIds = [
          ...new Set(ticketsWithSubtask.map((r) => r.ticketId)),
        ];
        const workflowsStarted = workflowTicketIds.length;

        let workflowsCompleted = 0;
        let avgWorkflowDurationHours: number | null = null;

        if (workflowTicketIds.length > 0) {
          const requiredNotDone = await this.prisma.subtask.findMany({
            where: {
              ticketId: { in: workflowTicketIds },
              isRequired: true,
              status: { notIn: [...SATISFIED_STATUSES] },
            },
            select: { ticketId: true },
            distinct: ['ticketId'],
          });
          const activeTicketIds = new Set(
            requiredNotDone.map((r) => r.ticketId),
          );
          workflowsCompleted = workflowTicketIds.length - activeTicketIds.size;

          const completedTickets = await this.prisma.ticket.findMany({
            where: {
              id: { in: workflowTicketIds },
              departmentId: dept.id,
              OR: [{ resolvedAt: { not: null } }, { closedAt: { not: null } }],
            },
            select: { createdAt: true, resolvedAt: true, closedAt: true },
          });
          if (completedTickets.length > 0) {
            const durations = completedTickets.map((tk) => {
              const end = tk.resolvedAt ?? tk.closedAt!;
              return (end.getTime() - tk.createdAt.getTime()) / MS_PER_HOUR;
            });
            avgWorkflowDurationHours =
              durations.reduce((a, b) => a + b, 0) / durations.length;
          }
        }

        return {
          departmentId: dept.id,
          departmentName: dept.name,
          ticketsCreated,
          workflowsStarted,
          workflowsCompleted,
          avgWorkflowDurationHours,
        };
      }),
    );

    return result;
  }

  async getBottlenecks(): Promise<{
    longestSubtasks: {
      subtaskTemplateId: string;
      title: string;
      avgDurationHours: number;
    }[];
    mostBlockedSubtasks: {
      subtaskTemplateId: string;
      title: string;
      blockedCount: number;
    }[];
  }> {
    const TOP = 10;

    const completedWithDuration = await this.prisma.subtask.findMany({
      where: {
        status: { in: ['DONE', 'SKIPPED'] },
        completedAt: { not: null },
        subtaskTemplateId: { not: null },
      },
      select: {
        subtaskTemplateId: true,
        createdAt: true,
        completedAt: true,
        readyAt: true,
        subtaskTemplate: { select: { title: true } },
      },
    });

    const byTemplate: Record<string, { title: string; durations: number[] }> =
      {};
    for (const s of completedWithDuration) {
      if (!s.subtaskTemplateId || !s.completedAt) continue;
      const start = s.readyAt ?? s.createdAt;
      const durationHours =
        (s.completedAt.getTime() - start.getTime()) / MS_PER_HOUR;
      if (!byTemplate[s.subtaskTemplateId]) {
        byTemplate[s.subtaskTemplateId] = {
          title: s.subtaskTemplate?.title ?? '',
          durations: [],
        };
      }
      byTemplate[s.subtaskTemplateId].durations.push(durationHours);
    }

    const longest = Object.entries(byTemplate)
      .map(([subtaskTemplateId, { title, durations }]) => ({
        subtaskTemplateId,
        title,
        avgDurationHours:
          durations.reduce((a, b) => a + b, 0) / durations.length,
      }))
      .sort((a, b) => b.avgDurationHours - a.avgDurationHours)
      .slice(0, TOP);

    const blockedByTemplate = await this.prisma.subtask.groupBy({
      by: ['subtaskTemplateId'],
      where: {
        status: 'BLOCKED',
        subtaskTemplateId: { not: null },
      },
      _count: { id: true },
    });

    const templateIds = [
      ...new Set(
        blockedByTemplate.map((r) => r.subtaskTemplateId).filter(Boolean),
      ),
    ] as string[];
    const templateTitles =
      templateIds.length > 0
        ? await this.prisma.subtaskTemplate.findMany({
            where: { id: { in: templateIds } },
            select: { id: true, title: true },
          })
        : [];
    const titleMap = new Map(templateTitles.map((t) => [t.id, t.title]));

    const mostBlocked = blockedByTemplate
      .filter((r) => r.subtaskTemplateId)
      .map((r) => ({
        subtaskTemplateId: r.subtaskTemplateId!,
        title: titleMap.get(r.subtaskTemplateId!) ?? '',
        blockedCount: r._count.id,
      }))
      .sort((a, b) => b.blockedCount - a.blockedCount)
      .slice(0, TOP);

    return { longestSubtasks: longest, mostBlockedSubtasks: mostBlocked };
  }
}
