import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/database/prisma.service';

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
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
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
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.name,
      role: user.role,
      teamId: user.teamId,
      teamName: user.team?.name ?? null,
      studioId: user.studioId,
      marketId: user.marketId,
      isActive: user.isActive,
    };
  }
}
