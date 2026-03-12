import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { RequestUser } from '../../modules/auth/strategies/jwt.strategy';

// Maps Department enum values to the legacy Team.name used for routing.
// BRIDGE: kept as fallback for tickets that have no taxonomy departmentId set.
// Remove once all tickets have taxonomy classification and all users have department assignments.
const DEPARTMENT_TO_TEAM_NAME: Record<string, string> = {
  HR: 'HR',
  OPERATIONS: 'Operations',
  MARKETING: 'Marketing',
};

@Injectable()
export class TicketVisibilityService {
  /**
   * Builds a Prisma `where` clause that limits ticket results to only
   * those the actor is allowed to see.
   *
   * ADMIN          → no restriction (returns `{}`)
   * DEPARTMENT_USER → tickets they own OR whose taxonomy department matches
   *                   one of their departments (department.code) OR in their
   *                   studio scope grants. BRIDGE: also matches tickets where
   *                   owner's team.name aligns with their legacy Department enum.
   * STUDIO_USER    → tickets they submitted OR tickets for their allowed studios.
   */
  buildWhereClause(actor: RequestUser): Prisma.TicketWhereInput {
    if (actor.role === Role.ADMIN) {
      return {};
    }

    if (actor.role === Role.DEPARTMENT_USER) {
      const departmentCodes = actor.departments
        .map((d) => String(d))
        .filter(Boolean);

      const conditions: Prisma.TicketWhereInput[] = [{ ownerId: actor.id }];

      if (departmentCodes.length > 0) {
        conditions.push({
          department: { code: { in: departmentCodes } },
        });

        // BRIDGE: legacy team-name fallback for tickets without taxonomy departmentId
        const teamNames = actor.departments
          .map((d) => DEPARTMENT_TO_TEAM_NAME[d])
          .filter(Boolean);
        if (teamNames.length > 0) {
          conditions.push({
            departmentId: null,
            owner: { team: { name: { in: teamNames } } },
          });
        }
      }

      if (actor.scopeStudioIds.length > 0) {
        conditions.push({ studioId: { in: actor.scopeStudioIds } });
      }

      return { OR: conditions };
    }

    // STUDIO_USER
    const studioIds: string[] = [];
    if (actor.studioId) studioIds.push(actor.studioId);
    studioIds.push(...actor.scopeStudioIds);

    const conditions: Prisma.TicketWhereInput[] = [{ requesterId: actor.id }];

    if (studioIds.length > 0) {
      conditions.push({ studioId: { in: studioIds } });
    }

    return { OR: conditions };
  }

  /**
   * Throws ForbiddenException if the actor cannot view the given ticket.
   * Call this after fetching the ticket (so the caller already knows it exists).
   * For DEPARTMENT_USER, caller must include ticket.department and ticket.owner.team.name
   * in the ticket select (department for taxonomy check, owner.team.name for bridge fallback).
   */
  assertCanView(
    ticket: {
      requesterId: string;
      ownerId: string | null;
      studioId: string | null;
      department?: { code: string } | null;
      owner?: { teamId?: string | null; team?: { name: string } | null } | null;
    },
    actor: RequestUser,
  ): void {
    if (actor.role === Role.ADMIN) return;

    if (actor.role === Role.DEPARTMENT_USER) {
      if (ticket.ownerId === actor.id) return;

      const departmentCodes = actor.departments
        .map((d) => String(d))
        .filter(Boolean);

      if (
        departmentCodes.length > 0 &&
        ticket.department?.code &&
        departmentCodes.includes(ticket.department.code)
      ) {
        return;
      }

      // BRIDGE: legacy team-name fallback for tickets without taxonomy department
      if (!ticket.department) {
        const teamNames = actor.departments
          .map((d) => DEPARTMENT_TO_TEAM_NAME[d])
          .filter(Boolean);
        if (
          teamNames.length > 0 &&
          ticket.owner?.team?.name &&
          teamNames.includes(ticket.owner.team.name)
        ) {
          return;
        }
      }

      if (actor.scopeStudioIds.includes(ticket.studioId ?? '')) return;

      throw new ForbiddenException('You do not have access to this ticket');
    }

    // STUDIO_USER
    if (ticket.requesterId === actor.id) return;

    const studioIds: string[] = [];
    if (actor.studioId) studioIds.push(actor.studioId);
    studioIds.push(...actor.scopeStudioIds);

    if (ticket.studioId && studioIds.includes(ticket.studioId)) return;

    throw new ForbiddenException('You do not have access to this ticket');
  }

  /**
   * Returns true if the actor can modify (update, change status, etc.) the ticket.
   * This is separate from visibility — even visible tickets may not be editable.
   *
   * ADMIN / DEPARTMENT_USER (owner or dept-routed) → can modify
   * STUDIO_USER → can only modify their own submitted tickets
   */
  canModify(
    ticket: { requesterId: string; ownerId: string | null },
    actor: RequestUser,
  ): boolean {
    if (actor.role === Role.ADMIN) return true;
    if (actor.role === Role.DEPARTMENT_USER) {
      return ticket.ownerId === actor.id;
    }
    // STUDIO_USER can only edit their own submitted tickets
    return ticket.requesterId === actor.id;
  }

  assertCanModify(
    ticket: { requesterId: string; ownerId: string | null },
    actor: RequestUser,
  ): void {
    if (!this.canModify(ticket, actor)) {
      throw new ForbiddenException(
        'You do not have permission to modify this ticket',
      );
    }
  }
}
