import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
const SATISFIED_STATUSES = ['DONE', 'SKIPPED'] as const;

export interface ResolvedTaxonomy {
  ticketClassId: string;
  departmentId: string | null;
  supportTopicId: string | null;
  maintenanceCategoryId: string | null;
}

/** Transaction client from prisma.$transaction(callback) — same shape as PrismaService for model access. */
export type PrismaTx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class SubtaskWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve workflow template by ticket context (same keying as form schemas).
   */
  async resolveWorkflowTemplate(ctx: ResolvedTaxonomy) {
    const { ticketClassId, departmentId, supportTopicId, maintenanceCategoryId } = ctx;
    const ticketClass = await this.prisma.ticketClass.findUnique({
      where: { id: ticketClassId, isActive: true },
      select: { code: true },
    });
    if (!ticketClass) return null;

    if (ticketClass.code === 'SUPPORT' && supportTopicId) {
      return this.prisma.subtaskWorkflowTemplate.findFirst({
        where: { ticketClassId, supportTopicId, isActive: true },
        include: {
          subtaskTemplates: {
            orderBy: { sortOrder: 'asc' },
            include: {
              department: { select: { id: true, code: true, name: true } },
              assignedUser: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    }
    if (ticketClass.code === 'MAINTENANCE' && maintenanceCategoryId) {
      return this.prisma.subtaskWorkflowTemplate.findFirst({
        where: { ticketClassId, maintenanceCategoryId, isActive: true },
        include: {
          subtaskTemplates: {
            orderBy: { sortOrder: 'asc' },
            include: {
              department: { select: { id: true, code: true, name: true } },
              assignedUser: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    }
    return null;
  }

  /**
   * Instantiate workflow template into live subtasks and dependencies for a ticket.
   * Run inside the same transaction as ticket create. Sets READY/LOCKED by dependency.
   */
  async instantiateForTicket(
    tx: PrismaTx,
    ticketId: string,
    ctx: ResolvedTaxonomy,
  ): Promise<void> {
    const template = await this.resolveWorkflowTemplate(ctx);
    if (!template || template.subtaskTemplates.length === 0) return;

    const templateDeps = await this.prisma.subtaskTemplateDependency.findMany({
      where: {
        subtaskTemplateId: { in: template.subtaskTemplates.map((t) => t.id) },
        dependsOnSubtaskTemplateId: { in: template.subtaskTemplates.map((t) => t.id) },
      },
    });
    const depsByTemplate = new Map<string, Set<string>>();
    for (const t of template.subtaskTemplates) {
      depsByTemplate.set(t.id, new Set());
    }
    for (const d of templateDeps) {
      depsByTemplate.get(d.subtaskTemplateId)?.add(d.dependsOnSubtaskTemplateId);
    }

    const now = new Date();
    const createdIds = new Map<string, string>();
    for (const st of template.subtaskTemplates) {
      const hasDeps = (depsByTemplate.get(st.id)?.size ?? 0) > 0;
      const isReady = !hasDeps;
      const subtask = await tx.subtask.create({
        data: {
          ticketId,
          title: st.title,
          description: st.description,
          departmentId: st.departmentId,
          ownerId: st.assignedUserId,
          isRequired: st.isRequired,
          subtaskTemplateId: st.id,
          status: hasDeps ? 'LOCKED' : 'READY',
          readyAt: isReady ? now : undefined,
        },
      });
      createdIds.set(st.id, subtask.id);
    }

    for (const d of templateDeps) {
      const subtaskId = createdIds.get(d.subtaskTemplateId);
      const dependsOnSubtaskId = createdIds.get(d.dependsOnSubtaskTemplateId);
      if (subtaskId && dependsOnSubtaskId) {
        await tx.subtaskDependency.create({
          data: { subtaskId, dependsOnSubtaskId },
        });
      }
    }
  }

  /**
   * When a subtask becomes DONE or SKIPPED, unlock downstream subtasks whose dependencies are all satisfied.
   * Sets status to READY and readyAt = now(). Returns IDs of subtasks that became READY (for notification emission).
   */
  async unlockDownstreamIfSatisfied(tx: PrismaTx, completedSubtaskId: string): Promise<string[]> {
    const downstream = await tx.subtaskDependency.findMany({
      where: { dependsOnSubtaskId: completedSubtaskId },
      select: { subtaskId: true },
    });
    const now = new Date();
    const becameReady: string[] = [];
    for (const { subtaskId } of downstream) {
      const deps = await tx.subtaskDependency.findMany({
        where: { subtaskId },
        select: { dependsOnSubtaskId: true },
      });
      const upstreamStatuses = await tx.subtask.findMany({
        where: { id: { in: deps.map((d) => d.dependsOnSubtaskId) } },
        select: { status: true },
      });
      const allSatisfied = upstreamStatuses.every((s) =>
        (SATISFIED_STATUSES as readonly string[]).includes(s.status),
      );
      if (allSatisfied) {
        await tx.subtask.update({
          where: { id: subtaskId },
          data: { status: 'READY', readyAt: now },
        });
        becameReady.push(subtaskId);
      }
    }
    return becameReady;
  }

  /**
   * DAG check: would adding (subtaskTemplateId -> dependsOnSubtaskTemplateId) create a cycle?
   * A cycle would exist if we can reach subtaskTemplateId from dependsOnSubtaskTemplateId (following "depends on" edges).
   */
  async wouldCreateCycle(
    workflowTemplateId: string,
    subtaskTemplateId: string,
    dependsOnSubtaskTemplateId: string,
  ): Promise<boolean> {
    if (subtaskTemplateId === dependsOnSubtaskTemplateId) return true;
    const templateIds = await this.prisma.subtaskTemplate.findMany({
      where: { workflowTemplateId },
      select: { id: true },
    });
    const idSet = new Set(templateIds.map((t) => t.id));
    if (!idSet.has(subtaskTemplateId) || !idSet.has(dependsOnSubtaskTemplateId))
      return false;

    const edges = await this.prisma.subtaskTemplateDependency.findMany({
      where: {
        subtaskTemplateId: { in: [...idSet] },
        dependsOnSubtaskTemplateId: { in: [...idSet] },
      },
    });
    // Forward graph: X depends on Y => X -> Y. If from tail (dependsOn) we can reach head (subtaskTemplateId), adding (head, tail) would create a cycle: head->tail and tail->...->head.
    const outEdges = new Map<string, string[]>();
    for (const e of edges) {
      if (!outEdges.has(e.subtaskTemplateId)) outEdges.set(e.subtaskTemplateId, []);
      outEdges.get(e.subtaskTemplateId)!.push(e.dependsOnSubtaskTemplateId);
    }
    const reachable = new Set<string>();
    const stack = [dependsOnSubtaskTemplateId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (reachable.has(cur)) continue;
      reachable.add(cur);
      for (const next of outEdges.get(cur) ?? []) {
        if (!reachable.has(next)) stack.push(next);
      }
    }
    return reachable.has(subtaskTemplateId);
  }

  async createWorkflowTemplate(data: {
    ticketClassId: string;
    departmentId?: string | null;
    supportTopicId?: string | null;
    maintenanceCategoryId?: string | null;
    name?: string | null;
    sortOrder?: number;
  }) {
    return this.prisma.subtaskWorkflowTemplate.create({
      data: {
        ticketClassId: data.ticketClassId,
        departmentId: data.departmentId ?? undefined,
        supportTopicId: data.supportTopicId ?? undefined,
        maintenanceCategoryId: data.maintenanceCategoryId ?? undefined,
        name: data.name ?? undefined,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async createSubtaskTemplate(data: {
    workflowTemplateId: string;
    title: string;
    description?: string | null;
    departmentId: string;
    assignedUserId?: string | null;
    isRequired?: boolean;
    sortOrder?: number;
  }) {
    await this.prisma.subtaskWorkflowTemplate.findUniqueOrThrow({
      where: { id: data.workflowTemplateId },
    });
    return this.prisma.subtaskTemplate.create({
      data: {
        workflowTemplateId: data.workflowTemplateId,
        title: data.title,
        description: data.description ?? undefined,
        departmentId: data.departmentId,
        assignedUserId: data.assignedUserId ?? undefined,
        isRequired: data.isRequired ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async addTemplateDependency(
    workflowTemplateId: string,
    subtaskTemplateId: string,
    dependsOnSubtaskTemplateId: string,
  ) {
    if (subtaskTemplateId === dependsOnSubtaskTemplateId) {
      throw new BadRequestException('A subtask cannot depend on itself');
    }
    const wouldCycle = await this.wouldCreateCycle(
      workflowTemplateId,
      subtaskTemplateId,
      dependsOnSubtaskTemplateId,
    );
    if (wouldCycle) {
      throw new BadRequestException(
        'Adding this dependency would create a cycle in the workflow template',
      );
    }
    return this.prisma.subtaskTemplateDependency.create({
      data: { subtaskTemplateId, dependsOnSubtaskTemplateId },
    });
  }

  async getWorkflowTemplate(id: string) {
    const t = await this.prisma.subtaskWorkflowTemplate.findUnique({
      where: { id },
      include: {
        subtaskTemplates: { orderBy: { sortOrder: 'asc' } },
        ticketClass: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        supportTopic: { select: { id: true, name: true } },
        maintenanceCategory: { select: { id: true, name: true } },
      },
    });
    if (!t) throw new NotFoundException(`Workflow template ${id} not found`);
    const deps = await this.prisma.subtaskTemplateDependency.findMany({
      where: {
        subtaskTemplateId: { in: t.subtaskTemplates.map((s) => s.id) },
        dependsOnSubtaskTemplateId: { in: t.subtaskTemplates.map((s) => s.id) },
      },
    });
    return { ...t, templateDependencies: deps };
  }
}
