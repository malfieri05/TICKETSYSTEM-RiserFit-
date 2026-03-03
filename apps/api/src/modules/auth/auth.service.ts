import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/database/prisma.service';
import { JwtPayload, RequestUser } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── Password auth ────────────────────────────────────────────────────────

  async register(
    email: string,
    name: string,
    password: string,
  ): Promise<{ access_token: string; user: RequestUser }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    if (password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: 'REQUESTER',
      },
    });

    return this.issueToken(user);
  }

  async loginWithPassword(
    email: string,
    password: string,
  ): Promise<{ access_token: string; user: RequestUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueToken(user);
  }

  // ── SSO ──────────────────────────────────────────────────────────────────

  async loginWithSso(
    ssoId: string,
    email: string,
    name: string,
  ): Promise<{ access_token: string; user: RequestUser }> {
    let user = await this.prisma.user.findUnique({ where: { ssoId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { ssoId, email, name, role: 'REQUESTER' },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated.');
    }

    return this.issueToken(user);
  }

  // ── Dev-only ─────────────────────────────────────────────────────────────

  async devLogin(
    email: string,
  ): Promise<{ access_token: string; user: RequestUser }> {
    if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Dev login not available in production');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.isActive) throw new UnauthorizedException('Your account has been deactivated.');

    return this.issueToken(user);
  }

  // ── Shared ───────────────────────────────────────────────────────────────

  private issueToken(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    teamId?: string | null;
    studioId?: string | null;
    marketId?: string | null;
  }): { access_token: string; user: RequestUser } {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as RequestUser['role'],
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.name,
        role: user.role as RequestUser['role'],
        isActive: user.isActive,
        teamId: user.teamId ?? undefined,
        studioId: user.studioId ?? undefined,
        marketId: user.marketId ?? undefined,
      },
    };
  }

  async validateToken(token: string) {
    return this.jwtService.verify(token);
  }
}
