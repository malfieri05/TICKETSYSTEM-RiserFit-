import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';
import { UserCacheService } from '../../../common/cache/user-cache.service';
import { Department } from '@prisma/client';

export interface JwtPayload {
  sub: string;   // user id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RequestUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  teamId: string | null;
  teamName?: string | null;
  studioId: string | null;
  marketId: string | null;
  isActive: boolean;
  /** Departments this user belongs to (DEPARTMENT_USER only; empty for others). */
  departments: Department[];
  /** Extra studio IDs granted by an admin as scope overrides. */
  scopeStudioIds: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private userCache: UserCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const cached = this.userCache.get(payload.sub);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teamId: true,
        team: { select: { name: true } },
        studioId: true,
        marketId: true,
        isActive: true,
        departments: { select: { department: true } },
        studioScopes: { select: { studioId: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const requestUser: RequestUser = {
      id: user.id,
      email: user.email,
      displayName: user.name,
      role: user.role,
      teamId: user.teamId,
      teamName: user.team?.name ?? null,
      studioId: user.studioId,
      marketId: user.marketId,
      isActive: user.isActive,
      departments: user.departments.map((d) => d.department),
      scopeStudioIds: user.studioScopes.map((s) => s.studioId),
    };
    this.userCache.set(user.id, requestUser);
    return requestUser;
  }
}
