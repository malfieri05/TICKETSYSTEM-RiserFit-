import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { Role } from '@prisma/client';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        teamId: true,
        studioId: true,
        marketId: true,
        team: { select: { id: true, name: true } },
        studio: { select: { id: true, name: true } },
        market: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

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
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async updateRole(targetUserId: string, newRole: Role, requestingUser: RequestUser) {
    // Only Admins can change roles
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can change user roles');
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async deactivate(targetUserId: string, requestingUser: RequestUser) {
    if (requestingUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can deactivate users');
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
      select: { id: true, email: true, name: true, isActive: true },
    });
  }
}
