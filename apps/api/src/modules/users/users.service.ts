import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { UserCacheService } from '../../common/cache/user-cache.service';
import { Prisma, Role, Department } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private userCache: UserCacheService,
  ) {}

  // ─── LIST ────────────────────────────────────────────────────────────────────

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        teamId: true,
        studioId: true,
        marketId: true,
        team: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        departments: { select: { department: true } },
        studioScopes: { select: { studioId: true } },
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.name,
      role: user.role,
      isActive: user.isActive,
      avatarUrl: user.avatarUrl,
      teamId: user.teamId,
      teamName: user.team?.name ?? null,
      studioId: user.studioId,
      marketId: user.marketId,
      team: user.team,
      studio: user.studio,
      market: user.market,
      departments: user.departments.map((d) => d.department),
      scopeStudioIds: user.studioScopes.map((s) => s.studioId),
      createdAt: user.createdAt,
    }));
  }

  // ─── FIND BY ID ──────────────────────────────────────────────────────────────

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        teamId: true,
        studioId: true,
        marketId: true,
        isActive: true,
        lastLoginAt: true,
        team: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        departments: { select: { department: true } },
        studioScopes: { select: { studioId: true } },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);

    return {
      ...user,
      departments: user.departments.map((d) => d.department),
      scopeStudioIds: user.studioScopes.map((s) => s.studioId),
    };
  }

  // ─── UPDATE ROLE ──────────────────────────────────────────────────────────────

  async updateRole(
    targetUserId: string,
    newRole: Role,
    requestingUser: RequestUser,
  ) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can change user roles');
    }

    this.userCache.invalidate(targetUserId);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true },
    });

    // DEPARTMENT_USER must always have at least one department. Default to MARKETING if none.
    if (newRole === Role.DEPARTMENT_USER) {
      const existing = await this.prisma.userDepartment.findMany({
        where: { userId: targetUserId },
        select: { department: true },
      });
      if (existing.length === 0) {
        await this.prisma.userDepartment.create({
          data: {
            userId: targetUserId,
            department: Department.MARKETING,
            assignedBy: requestingUser.id,
          },
        });
      }
    }

    return this.prisma.user.findUniqueOrThrow({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  // ─── DEACTIVATE ───────────────────────────────────────────────────────────────

  async deactivate(targetUserId: string, requestingUser: RequestUser) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can deactivate users');
    }

    this.userCache.invalidate(targetUserId);

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      select: { id: true, email: true, name: true, isActive: true },
    });
  }

  // ─── DEPARTMENT MANAGEMENT ────────────────────────────────────────────────────

  async listDepartments(targetUserId: string) {
    await this.assertUserExists(targetUserId);
    const rows = await this.prisma.userDepartment.findMany({
      where: { userId: targetUserId },
      select: { department: true, assignedAt: true },
    });
    return rows.map((r) => ({
      department: r.department,
      assignedAt: r.assignedAt,
    }));
  }

  async setDepartments(
    targetUserId: string,
    departments: Department[],
    requestingUser: RequestUser,
  ) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only admins can manage department assignments',
      );
    }

    const user = await this.assertUserExists(targetUserId);
    if (user.role !== Role.DEPARTMENT_USER) {
      throw new BadRequestException(
        'Department assignments only apply to DEPARTMENT_USER accounts',
      );
    }

    if (departments.length === 0) {
      throw new BadRequestException('At least one department must be assigned');
    }

    // Replace all department assignments atomically
    await this.prisma.$transaction([
      this.prisma.userDepartment.deleteMany({
        where: { userId: targetUserId },
      }),
      this.prisma.userDepartment.createMany({
        data: departments.map((department) => ({
          userId: targetUserId,
          department,
          assignedBy: requestingUser.id,
        })),
        skipDuplicates: true,
      }),
    ]);

    this.userCache.invalidate(targetUserId);

    return this.listDepartments(targetUserId);
  }

  // ─── STUDIO SCOPE MANAGEMENT ─────────────────────────────────────────────────

  async listStudioScopes(targetUserId: string) {
    await this.assertUserExists(targetUserId);
    return this.prisma.userStudioScope.findMany({
      where: { userId: targetUserId },
      select: {
        studioId: true,
        grantedAt: true,
        studio: { select: { id: true, name: true } },
      },
    });
  }

  async addStudioScope(
    targetUserId: string,
    studioId: string,
    requestingUser: RequestUser,
  ) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only admins can grant studio scope overrides',
      );
    }

    await this.assertUserExists(targetUserId);
    await this.assertStudioExists(studioId);

    // Idempotent upsert
    await this.prisma.userStudioScope.upsert({
      where: { userId_studioId: { userId: targetUserId, studioId } },
      create: { userId: targetUserId, studioId, grantedBy: requestingUser.id },
      update: {},
    });

    this.userCache.invalidate(targetUserId);

    return this.listStudioScopes(targetUserId);
  }

  async removeStudioScope(
    targetUserId: string,
    studioId: string,
    requestingUser: RequestUser,
  ) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only admins can revoke studio scope overrides',
      );
    }

    await this.assertUserExists(targetUserId);

    // No-op if the scope doesn't exist
    await this.prisma.userStudioScope.deleteMany({
      where: { userId: targetUserId, studioId },
    });

    this.userCache.invalidate(targetUserId);

    return this.listStudioScopes(targetUserId);
  }

  // ─── SET DEFAULT STUDIO (Stage 23) ───────────────────────────────────────────

  async setDefaultStudio(
    targetUserId: string,
    studioId: string | null,
    requestingUser: RequestUser,
  ) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Only admins can set a user's default location",
      );
    }

    await this.assertUserExists(targetUserId);
    if (studioId != null) {
      await this.assertStudioExists(studioId);
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { studioId },
      select: {
        id: true,
        studioId: true,
        studio: { select: { id: true, name: true } },
      },
    });

    this.userCache.invalidate(targetUserId);

    return {
      id: updated.id,
      studioId: updated.studioId,
      studio: updated.studio,
    };
  }

  /**
   * Creates user + junction rows inside an existing transaction (invite acceptance only).
   * InvitationService owns validation; this method owns persistence shape only.
   */
  async provisionUserFromInvite(
    tx: Prisma.TransactionClient,
    args: {
      email: string;
      name: string;
      passwordHash: string;
      role: Role;
      invitedByUserId: string;
      departments: Department[];
      defaultStudioId: string | null;
      additionalStudioIds: string[];
    },
  ) {
    const user = await tx.user.create({
      data: {
        email: args.email,
        name: args.name,
        passwordHash: args.passwordHash,
        role: args.role,
        studioId: args.role === Role.STUDIO_USER ? args.defaultStudioId : null,
        marketId: null,
        teamId: null,
        isActive: true,
      },
    });

    if (args.role === Role.DEPARTMENT_USER) {
      await tx.userDepartment.createMany({
        data: args.departments.map((department) => ({
          userId: user.id,
          department,
          assignedBy: args.invitedByUserId,
        })),
      });
    }

    if (args.role === Role.STUDIO_USER && args.additionalStudioIds.length > 0) {
      const extras = args.additionalStudioIds.filter(
        (id) => id !== args.defaultStudioId,
      );
      if (extras.length > 0) {
        await tx.userStudioScope.createMany({
          data: extras.map((studioId) => ({
            userId: user.id,
            studioId,
            grantedBy: args.invitedByUserId,
          })),
          skipDuplicates: true,
        });
      }
    }

    this.userCache.invalidate(user.id);

    return user;
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────────

  private async assertUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  private async assertStudioExists(studioId: string) {
    const studio = await this.prisma.studio.findUnique({
      where: { id: studioId },
      select: { id: true },
    });
    if (!studio) throw new NotFoundException(`Studio ${studioId} not found`);
    return studio;
  }
}
