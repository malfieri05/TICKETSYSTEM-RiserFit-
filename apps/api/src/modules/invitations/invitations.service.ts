import {
  Injectable,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Prisma,
  Role,
  Department,
  InvitationStatus,
  AuditAction,
} from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { AuditLogService } from '../../common/audit-log/audit-log.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  mintInviteToken,
  normalizeInviteEmail,
  sha256Hex,
  tokenStringToRawBytes,
  timingSafeEqualHex,
} from './invitation-token.util';
import {
  wrapInviteTokenRaw,
  unwrapInviteTokenWrap,
} from './invitation-token-wrap.util';
import {
  QUEUES,
  INVITE_EMAIL_JOB_OPTIONS,
  type InviteEmailJobData,
} from '../../common/queue/queue.constants';

const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: 'Admin',
  [Role.DEPARTMENT_USER]: 'Department User',
  [Role.STUDIO_USER]: 'Studio User',
};

const MS_DAY = 86_400_000;
const MS_VALIDATE_WINDOW = 15 * 60 * 1000;

/** Matches web admin invite + Manage locations; expand to every studio at create time (first by name = default). */
const INVITE_ALL_STUDIOS_SENTINEL = '__ALL__';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly validateFailBuckets = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private authService: AuthService,
    private auditLog: AuditLogService,
    @InjectQueue(QUEUES.INVITE_EMAIL) private inviteEmailQueue: Queue,
  ) {}

  private ttlMs(): number {
    const days = parseInt(process.env.INVITE_TOKEN_TTL_DAYS ?? '7', 10);
    return Math.max(1, days) * MS_DAY;
  }

  private maxResendsPerDay(): number {
    return parseInt(process.env.INVITE_MAX_RESENDS_PER_DAY ?? '5', 10);
  }

  private maxValidateFails(): number {
    return parseInt(
      process.env.INVITE_VALIDATE_MAX_PER_HASH_WINDOW ?? '30',
      10,
    );
  }

  publicBaseUrl(): string {
    const u = process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000';
    return u.replace(/\/$/, '');
  }

  private inviteLink(tokenString: string): string {
    return `${this.publicBaseUrl()}/invite/accept?token=${encodeURIComponent(tokenString)}`;
  }

  private async enqueueMail(data: InviteEmailJobData): Promise<void> {
    if (process.env.INVITE_EMAIL_SYNC_DEV === 'true') {
      const { InviteMailService } = await import('./invite-mail.service');
      const m = new InviteMailService();
      await m.sendInvite(data);
      return;
    }
    await this.inviteEmailQueue.add('send', data, INVITE_EMAIL_JOB_OPTIONS);
  }

  private async validateCreatePayload(dto: CreateInvitationDto): Promise<{
    departments: Department[];
    defaultStudioId: string | null;
    additionalStudioIds: string[];
  }> {
    const role = dto.assignedRole;
    if (role === Role.ADMIN) {
      if (dto.defaultStudioId || (dto.additionalStudioIds?.length ?? 0) > 0)
        throw new BadRequestException('ADMIN invites must not include studio scope');
      if (dto.departments?.length)
        throw new BadRequestException('ADMIN invites must not include departments');
    }
    if (role === Role.DEPARTMENT_USER) {
      const depts = dto.departments ?? [];
      if (depts.length === 0)
        throw new BadRequestException('At least one department required');
      if (dto.defaultStudioId || (dto.additionalStudioIds?.length ?? 0) > 0)
        throw new BadRequestException('Department invites must not include studios');
    }
    if (role === Role.STUDIO_USER) {
      if (!dto.defaultStudioId)
        throw new BadRequestException('defaultStudioId required for studio users');
      if (dto.departments?.length)
        throw new BadRequestException('Studio invites must not include departments');
      if (dto.defaultStudioId === INVITE_ALL_STUDIOS_SENTINEL) {
        const studios = await this.prisma.studio.findMany({
          select: { id: true },
          orderBy: { name: 'asc' },
        });
        if (studios.length === 0) {
          throw new BadRequestException(
            'No studios exist yet. Add studios first, or pick a single default location.',
          );
        }
        return {
          departments: [],
          defaultStudioId: studios[0].id,
          additionalStudioIds: studios.slice(1).map((s) => s.id),
        };
      }
      const add = [...new Set(dto.additionalStudioIds ?? [])].filter(
        (id) => id !== dto.defaultStudioId,
      );
      return {
        departments: [],
        defaultStudioId: dto.defaultStudioId,
        additionalStudioIds: add,
      };
    }
    return {
      departments: dto.departments ?? [],
      defaultStudioId: null,
      additionalStudioIds: [],
    };
  }

  async create(dto: CreateInvitationDto, invitedByUserId: string) {
    const emailNormalized = normalizeInviteEmail(dto.email);
    const spec = await this.validateCreatePayload(dto);

    const activeUser = await this.prisma.user.findFirst({
      where: { email: emailNormalized, isActive: true },
      select: { id: true },
    });
    if (activeUser) {
      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'A user with this email already exists.',
      });
    }

    const pending = await this.prisma.userInvitation.findFirst({
      where: { emailNormalized, status: InvitationStatus.PENDING },
    });
    if (pending) {
      throw new ConflictException({
        code: 'PENDING_INVITE_EXISTS',
        message: 'A pending invitation already exists for this email.',
      });
    }

    if (spec.defaultStudioId) {
      await this.assertStudio(spec.defaultStudioId);
    }
    for (const sid of spec.additionalStudioIds) {
      await this.assertStudio(sid);
    }

    const { raw, tokenString } = mintInviteToken();
    const tokenHash = sha256Hex(raw);
    const tokenWrap = wrapInviteTokenRaw(raw);
    const expiresAt = new Date(Date.now() + this.ttlMs());

    const inv = await this.prisma.userInvitation.create({
      data: {
        emailNormalized,
        invitedByUserId,
        tokenHash,
        tokenWrap,
        expiresAt,
        assignedRole: dto.assignedRole,
        seedName: dto.seedName.trim(),
        ...(dto.assignedRole === Role.DEPARTMENT_USER
          ? {
              departmentsJson:
                spec.departments as unknown as Prisma.InputJsonValue,
            }
          : {}),
        defaultStudioId:
          dto.assignedRole === Role.STUDIO_USER ? spec.defaultStudioId : null,
        ...(dto.assignedRole === Role.STUDIO_USER &&
        spec.additionalStudioIds.length > 0
          ? {
              additionalStudioIds:
                spec.additionalStudioIds as unknown as Prisma.InputJsonValue,
            }
          : {}),
        sendCount: 1,
        lastSentAt: new Date(),
      },
    });

    await this.auditLog.log({
      actorId: invitedByUserId,
      action: AuditAction.CREATED,
      entityType: 'UserInvitation',
      entityId: inv.id,
      metadata: { inviteEvent: 'INVITE_CREATED', role: dto.assignedRole },
    });

    await this.enqueueMail({
      to: emailNormalized,
      inviteLink: this.inviteLink(tokenString),
      seedName: inv.seedName,
    });

    return {
      id: inv.id,
      emailNormalized,
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  async listForAdmin(params?: { status?: InvitationStatus; skip?: number; take?: number }) {
    const where =
      params?.status != null ? { status: params.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.userInvitation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params?.skip ?? 0,
        take: Math.min(params?.take ?? 50, 100),
        select: {
          id: true,
          emailNormalized: true,
          status: true,
          assignedRole: true,
          seedName: true,
          expiresAt: true,
          createdAt: true,
          acceptedAt: true,
          lastSentAt: true,
          sendCount: true,
          createdUserId: true,
          invitedByUserId: true,
        },
      }),
      this.prisma.userInvitation.count({ where }),
    ]);
    return { data: items, total };
  }

  private recordValidateFailure(bucketKey: string): void {
    const now = Date.now();
    const arr = (this.validateFailBuckets.get(bucketKey) ?? []).filter(
      (t) => now - t < MS_VALIDATE_WINDOW,
    );
    arr.push(now);
    this.validateFailBuckets.set(bucketKey, arr);
  }

  private isValidateBlocked(bucketKey: string): boolean {
    const now = Date.now();
    const arr = (this.validateFailBuckets.get(bucketKey) ?? []).filter(
      (t) => now - t < MS_VALIDATE_WINDOW,
    );
    return arr.length >= this.maxValidateFails();
  }

  async validateToken(token: string) {
    const raw = tokenStringToRawBytes(token);
    const bucketKey = raw
      ? sha256Hex(raw)
      : sha256Hex(Buffer.from(token, 'utf8'));
    if (this.isValidateBlocked(bucketKey)) {
      return { valid: false as const };
    }

    if (!raw) {
      this.recordValidateFailure(bucketKey);
      return { valid: false as const };
    }

    const tokenHash = sha256Hex(raw);
    const inv = await this.prisma.userInvitation.findFirst({
      where: { tokenHash, status: InvitationStatus.PENDING },
    });

    if (!inv) {
      this.recordValidateFailure(bucketKey);
      return { valid: false as const };
    }

    if (inv.revokedAt) {
      return { valid: false as const };
    }
    if (inv.expiresAt.getTime() <= Date.now()) {
      return { valid: false as const };
    }

    const scopeSummary = await this.buildScopeSummary(inv);
    return {
      valid: true as const,
      expiresAt: inv.expiresAt.toISOString(),
      emailMasked: maskEmail(inv.emailNormalized),
      roleLabel: ROLE_LABEL[inv.assignedRole],
      name: inv.seedName,
      scopeSummary,
    };
  }

  private async buildScopeSummary(inv: {
    assignedRole: Role;
    departmentsJson: Prisma.JsonValue | null;
    defaultStudioId: string | null;
    additionalStudioIds: Prisma.JsonValue | null;
  }): Promise<string> {
    if (inv.assignedRole === Role.ADMIN) return 'Administrator access';
    if (inv.assignedRole === Role.DEPARTMENT_USER) {
      const d = inv.departmentsJson as Department[] | null;
      if (!d?.length) return '—';
      return d.join(', ');
    }
    const ids = [
      ...(inv.defaultStudioId ? [inv.defaultStudioId] : []),
      ...((inv.additionalStudioIds as string[] | null) ?? []),
    ];
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return '—';
    const studios = await this.prisma.studio.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    const nameById = new Map(studios.map((s) => [s.id, s.name]));
    return uniq
      .map((id, i) => {
        const n = nameById.get(id) ?? id;
        return i === 0 ? `Default: ${n}` : n;
      })
      .join('; ');
  }

  async accept(token: string, password: string) {
    let passwordHash: string;
    try {
      passwordHash = await this.authService.hashPassword(password);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw new HttpException(
          { success: false, errorCode: 'INVITE_INVALID' },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw e;
    }

    const raw = tokenStringToRawBytes(token);
    if (!raw) {
      throw new HttpException(
        { success: false, errorCode: 'INVITE_INVALID' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const tokenHash = sha256Hex(raw);

    let invitationId: string;
    let newUserId: string;
    try {
      const out = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM user_invitations
          WHERE token_hash = ${tokenHash}
            AND status = 'PENDING'::"InvitationStatus"
          FOR UPDATE
          LIMIT 1
        `;
        if (!locked.length) {
          throw new Error('INVITE_INVALID');
        }
        const inv = await tx.userInvitation.findUniqueOrThrow({
          where: { id: locked[0].id },
        });

        if (
          inv.status !== InvitationStatus.PENDING ||
          inv.expiresAt.getTime() <= Date.now()
        ) {
          throw new Error('INVITE_INVALID');
        }

        const departments =
          inv.assignedRole === Role.DEPARTMENT_USER
            ? (inv.departmentsJson as Department[] | null) ?? []
            : [];
        if (
          inv.assignedRole === Role.DEPARTMENT_USER &&
          departments.length === 0
        ) {
          throw new Error('INVITE_INVALID');
        }
        const additionalStudioIds =
          inv.assignedRole === Role.STUDIO_USER
            ? ([
                ...((inv.additionalStudioIds as string[] | null) ?? []),
              ].filter(Boolean) ?? [])
            : [];

        const existing = await tx.user.findFirst({
          where: { email: inv.emailNormalized },
          select: { id: true, isActive: true },
        });
        if (existing?.isActive) {
          throw new Error('INVITE_INVALID');
        }

        const invitePayload = {
          email: inv.emailNormalized,
          name: inv.seedName,
          passwordHash,
          role: inv.assignedRole,
          invitedByUserId: inv.invitedByUserId,
          departments,
          defaultStudioId: inv.defaultStudioId,
          additionalStudioIds,
        };

        const user = existing
          ? await this.usersService.reactivateUserFromInvite(tx, {
              userId: existing.id,
              ...invitePayload,
            })
          : await this.usersService.provisionUserFromInvite(tx, invitePayload);

        // `created_user_id` is unique: a prior ACCEPTED invite may still point at this user after
        // deactivation + re-invite. Clear it so this acceptance can claim the row.
        await tx.userInvitation.updateMany({
          where: { createdUserId: user.id },
          data: { createdUserId: null },
        });

        await tx.userInvitation.update({
          where: { id: inv.id },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedAt: new Date(),
            createdUserId: user.id,
          },
        });
        return { invitationId: inv.id, newUserId: user.id };
      });
      invitationId = out.invitationId;
      newUserId = out.newUserId;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.warn(`invite accept failed: ${(e as Error).message}`);
      throw new HttpException(
        { success: false, errorCode: 'INVITE_INVALID' },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.auditLog.log({
      actorId: newUserId,
      action: AuditAction.CREATED,
      entityType: 'UserInvitation',
      entityId: invitationId,
      metadata: {
        inviteEvent: 'INVITE_ACCEPTED',
        newUserId,
      },
    });

    return { success: true as const };
  }

  async resend(id: string, actorId: string) {
    const inv = await this.prisma.userInvitation.findUnique({ where: { id } });
    if (!inv || inv.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation not found or not pending');
    }

    const now = new Date();
    const windowMs = MS_DAY;
    let windowStart = inv.resendWindowStartAt ?? inv.createdAt;
    let count = inv.resendsInWindow;
    if (now.getTime() - windowStart.getTime() > windowMs) {
      windowStart = now;
      count = 0;
    }
    if (count >= this.maxResendsPerDay()) {
      throw new HttpException(
        { code: 'INVITE_RESEND_LIMIT', message: 'Resend limit reached for 24 hours.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const raw = unwrapInviteTokenWrap(inv.tokenWrap);
    if (!raw || !timingSafeEqualHex(sha256Hex(raw), inv.tokenHash)) {
      throw new BadRequestException('Cannot resend: token wrap invalid; use Regenerate.');
    }
    const tokenString = raw.toString('base64url');

    await this.prisma.userInvitation.update({
      where: { id },
      data: {
        lastSentAt: now,
        sendCount: { increment: 1 },
        resendWindowStartAt: windowStart,
        resendsInWindow: count + 1,
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATED,
      entityType: 'UserInvitation',
      entityId: id,
      metadata: { inviteEvent: 'INVITE_RESENT', sendCount: inv.sendCount + 1 },
    });

    await this.enqueueMail({
      to: inv.emailNormalized,
      inviteLink: this.inviteLink(tokenString),
      seedName: inv.seedName,
    });

    return { ok: true as const };
  }

  async regenerate(id: string, actorId: string) {
    const inv = await this.prisma.userInvitation.findUnique({ where: { id } });
    if (!inv || inv.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation not found or not pending');
    }

    const { raw, tokenString } = mintInviteToken();
    const tokenHash = sha256Hex(raw);
    const tokenWrap = wrapInviteTokenRaw(raw);
    const expiresAt = new Date(Date.now() + this.ttlMs());

    await this.prisma.userInvitation.update({
      where: { id },
      data: {
        tokenHash,
        tokenWrap,
        tokenVersion: { increment: 1 },
        expiresAt,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATED,
      entityType: 'UserInvitation',
      entityId: id,
      metadata: { inviteEvent: 'INVITE_REGENERATED' },
    });

    await this.enqueueMail({
      to: inv.emailNormalized,
      inviteLink: this.inviteLink(tokenString),
      seedName: inv.seedName,
    });

    return { ok: true as const, expiresAt: expiresAt.toISOString() };
  }

  async revoke(id: string, actorId: string) {
    const inv = await this.prisma.userInvitation.findUnique({ where: { id } });
    if (!inv || inv.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation not found or not pending');
    }
    await this.prisma.userInvitation.update({
      where: { id },
      data: {
        status: InvitationStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATED,
      entityType: 'UserInvitation',
      entityId: id,
      metadata: { inviteEvent: 'INVITE_REVOKED' },
    });
    return { ok: true as const };
  }

  private async assertStudio(studioId: string) {
    const s = await this.prisma.studio.findUnique({
      where: { id: studioId },
      select: { id: true },
    });
    if (!s) throw new BadRequestException(`Studio ${studioId} not found`);
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const c = local?.[0] ?? '?';
  return `${c}***@${domain}`;
}

