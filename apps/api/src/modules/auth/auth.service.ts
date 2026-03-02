import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/database/prisma.service';
import { JwtPayload, RequestUser } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // Called after SSO callback validates the identity provider token.
  // Finds or creates the user in our DB, then issues our own JWT.
  async loginWithSso(ssoId: string, email: string, name: string): Promise<{ access_token: string; user: RequestUser }> {
    let user = await this.prisma.user.findUnique({ where: { ssoId } });

    if (!user) {
      // First login — auto-provision the user
      user = await this.prisma.user.create({
        data: {
          ssoId,
          email,
          name,
          // Default role is REQUESTER — Admin must elevate manually
          role: 'REQUESTER',
        },
      });
    } else {
      // Update last login timestamp
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.name,
        role: user.role,
        isActive: user.isActive,
        teamId: user.teamId,
        studioId: user.studioId,
        marketId: user.marketId,
      },
    };
  }

  // Dev-only: issue a JWT directly for a user by email (NO SSO).
  // This endpoint is disabled in production.
  async devLogin(email: string): Promise<{ access_token: string; user: Record<string, unknown> }> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Dev login not available in production');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.name,
        role: user.role,
        isActive: user.isActive,
        teamId: user.teamId,
        studioId: user.studioId,
        marketId: user.marketId,
      },
    };
  }

  async validateToken(token: string) {
    return this.jwtService.verify(token);
  }
}
