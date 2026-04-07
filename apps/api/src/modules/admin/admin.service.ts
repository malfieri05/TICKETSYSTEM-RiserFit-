import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES } from '../../common/queue/queue.constants';
import type { Prisma } from '@prisma/client';
import {
  CreateMarketDto,
  UpdateMarketDto,
  CreateStudioDto,
  UpdateStudioDto,
  UpsertStudioProfileDto,
} from './dto/admin.dto';
import { haversineMiles } from '../../utils/geoDistance';

export type SystemServiceCategory =
  | 'database'
  | 'cache'
  | 'storage'
  | 'email'
  | 'ai'
  | 'policy'
  | 'hosting'
  | 'monitoring'
  | 'other';

export type SystemServiceStatus =
  | 'healthy'
  | 'degraded'
  | 'unknown'
  | 'not_configured';

export type SystemServiceCriticality = 'critical' | 'important' | 'optional';

export interface SystemServiceDto {
  id: string;
  name: string;
  category: SystemServiceCategory;
  roleDescription: string;
  status: SystemServiceStatus;
  statusReason?: string;
  criticality: SystemServiceCriticality;
  lastCheckedAt: string;
  lastError?: string | null;
  details: {
    host?: string;
    region?: string;
    planHint?: string;
  };
  links: {
    label: string;
    url: string;
    kind: 'dashboard' | 'docs' | 'other';
  }[];
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.NOTIFICATION_FANOUT)
    private readonly fanoutQueue: Queue,
  ) {}

  // ─── System services (admin monitoring) ─────────────────────────────────────

  private getEnv(key: string): string | undefined {
    const v = this.config.get<string>(key);
    return v != null && v !== '' ? v : undefined;
  }

  private safeHostFromUrl(url?: string): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).host;
    } catch {
      return undefined;
    }
  }

  private async checkDatabaseHealth(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`System monitoring DB check failed — ${message}`);
      return { ok: false, reason: message };
    }
  }

  private async checkRedisHealth(): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.fanoutQueue.getJobCounts();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`System monitoring Redis check failed — ${message}`);
      return { ok: false, reason: message };
    }
  }

  async getSystemServices(): Promise<{
    environment: { name: string; region?: string; version?: string | null };
    services: SystemServiceDto[];
  }> {
    const now = new Date();
    const nowIso = now.toISOString();

    const nodeEnv = this.getEnv('NODE_ENV') ?? 'development';
    const appEnv = this.getEnv('APP_ENV');
    const envName = appEnv ?? nodeEnv;
    const region =
      this.getEnv('APP_REGION') ??
      this.getEnv('REGION') ??
      this.getEnv('FLY_REGION');
    const version =
      this.getEnv('APP_VERSION') ??
      this.getEnv('RENDER_GIT_COMMIT') ??
      null;

    const dbUrl = this.getEnv('DATABASE_URL');
    const dbHost = dbUrl ? this.safeHostFromUrl(dbUrl) : undefined;

    const redisHost = this.getEnv('REDIS_HOST');
    const redisRegion = this.getEnv('REDIS_REGION');

    const s3Endpoint = this.getEnv('S3_ENDPOINT');
    const s3Bucket = this.getEnv('S3_BUCKET');
    const s3Region = this.getEnv('S3_REGION');

    const hasPostmark = !!this.getEnv('POSTMARK_API_TOKEN');
    const hasTeamsWebhook = !!this.getEnv('TEAMS_WEBHOOK_URL');
    const hasOpenAi = !!this.getEnv('OPENAI_API_KEY');
    const riserBaseUrl = this.getEnv('RISER_API_BASE_URL');
    const riserKey = this.getEnv('RISER_API_KEY');

    const appHostingDashboardUrl = this.getEnv('APP_HOSTING_DASHBOARD_URL');
    const neonDashboardUrl = this.getEnv('NEON_DASHBOARD_URL');
    const upstashDashboardUrl = this.getEnv('UPSTASH_DASHBOARD_URL');
    const postmarkDashboardUrl = this.getEnv('POSTMARK_DASHBOARD_URL');
    const openAiDashboardUrl = this.getEnv('OPENAI_DASHBOARD_URL');
    const riserDashboardUrl = this.getEnv('RISER_DASHBOARD_URL');
    const uptimeDashboardUrl = this.getEnv('UPTIME_MONITOR_DASHBOARD_URL');
    const sentryDashboardUrl = this.getEnv('SENTRY_DASHBOARD_URL');
    const s3DashboardUrl = this.getEnv('S3_DASHBOARD_URL');

    // Health checks where justified
    const [dbHealth, redisHealth] = await Promise.all([
      dbUrl ? this.checkDatabaseHealth() : Promise.resolve({ ok: false, reason: 'DATABASE_URL not configured' }),
      redisHost
        ? this.checkRedisHealth()
        : Promise.resolve({ ok: false, reason: 'REDIS_HOST not configured' }),
    ]);

    const services: SystemServiceDto[] = [];

    // App Hosting
    services.push({
      id: 'app-hosting',
      name: 'App Hosting',
      category: 'hosting',
      roleDescription:
        'Runs the API, web frontend, and background workers for the ticketing system.',
      status: appHostingDashboardUrl ? 'unknown' : 'unknown',
      statusReason: appHostingDashboardUrl
        ? 'Hosting dashboard configured.'
        : 'Hosting dashboard URL not configured.',
      criticality: 'critical',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {
        planHint: appHostingDashboardUrl ? 'Configured' : 'Unknown',
      },
      links: appHostingDashboardUrl
        ? [
            {
              label: 'Open hosting dashboard',
              url: appHostingDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Neon Postgres
    services.push({
      id: 'postgres',
      name: 'Neon Postgres',
      category: 'database',
      roleDescription:
        'Primary transactional database for tickets, users, notifications, and reporting.',
      status: dbUrl
        ? dbHealth.ok
          ? 'healthy'
          : 'degraded'
        : 'not_configured',
      statusReason: !dbUrl
        ? 'DATABASE_URL is not configured.'
        : dbHealth.ok
          ? 'Database reachable.'
          : `Database check failed.`,
      criticality: 'critical',
      lastCheckedAt: nowIso,
      lastError: !dbUrl ? null : dbHealth.ok ? null : dbHealth.reason ?? null,
      details: {
        host: dbHost,
        planHint: neonDashboardUrl ? 'Managed by Neon.tech' : undefined,
      },
      links: neonDashboardUrl
        ? [
            {
              label: 'Open Neon dashboard',
              url: neonDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Redis / Upstash
    services.push({
      id: 'redis',
      name: 'Redis (Queues & SSE)',
      category: 'cache',
      roleDescription:
        'Backs BullMQ queues for notifications/SLA and supports multi-instance SSE.',
      status: redisHost
        ? redisHealth.ok
          ? 'healthy'
          : 'degraded'
        : 'not_configured',
      statusReason: !redisHost
        ? 'REDIS_HOST is not configured.'
        : redisHealth.ok
          ? 'Redis reachable via notification-fanout queue.'
          : 'Redis check failed.',
      criticality: 'critical',
      lastCheckedAt: nowIso,
      lastError: !redisHost
        ? null
        : redisHealth.ok
          ? null
          : redisHealth.reason ?? null,
      details: {
        host: redisHost,
        region: redisRegion,
        planHint: upstashDashboardUrl ? 'Managed Redis (e.g. Upstash)' : undefined,
      },
      links: upstashDashboardUrl
        ? [
            {
              label: 'Open Redis dashboard',
              url: upstashDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // S3 / Object Storage
    const s3Configured = !!s3Bucket && !!(s3Endpoint || s3Region);
    services.push({
      id: 's3',
      name: 'S3-Compatible Storage',
      category: 'storage',
      roleDescription: 'Stores ticket attachments (files up to 25MB).',
      status: s3Configured ? 'unknown' : 'not_configured',
      statusReason: s3Configured
        ? 'Attachment storage configured.'
        : 'S3_BUCKET and S3 endpoint/region not fully configured.',
      criticality: 'important',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {
        host: this.safeHostFromUrl(s3Endpoint),
        region: s3Region,
        planHint: s3Bucket ? `Bucket: ${s3Bucket}` : undefined,
      },
      links: s3DashboardUrl
        ? [
            {
              label: 'Open storage dashboard',
              url: s3DashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Postmark
    services.push({
      id: 'postmark',
      name: 'Postmark',
      category: 'email',
      roleDescription: 'Sends transactional email notifications for tickets.',
      status: hasPostmark ? 'unknown' : 'not_configured',
      statusReason: hasPostmark
        ? 'POSTMARK_API_TOKEN configured.'
        : 'POSTMARK_API_TOKEN not configured; email notifications disabled.',
      criticality: 'important',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {
        planHint: hasPostmark ? 'Transactional email enabled' : 'Email disabled',
      },
      links: postmarkDashboardUrl
        ? [
            {
              label: 'Open Postmark dashboard',
              url: postmarkDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Microsoft Teams webhook
    services.push({
      id: 'teams',
      name: 'Microsoft Teams Webhook',
      category: 'other',
      roleDescription:
        'Sends ticket and notification events into configured Microsoft Teams channels.',
      status: hasTeamsWebhook ? 'unknown' : 'not_configured',
      statusReason: hasTeamsWebhook
        ? 'TEAMS_WEBHOOK_URL configured.'
        : 'TEAMS_WEBHOOK_URL not configured; Teams notifications disabled.',
      criticality: 'optional',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {},
      links: [],
    });

    // OpenAI
    services.push({
      id: 'openai',
      name: 'OpenAI',
      category: 'ai',
      roleDescription:
        'Embeddings and chat completions for the AI assistant and handbook Q&A.',
      status: hasOpenAi ? 'unknown' : 'not_configured',
      statusReason: hasOpenAi
        ? 'OPENAI_API_KEY configured.'
        : 'OPENAI_API_KEY not configured; assistant and handbook chat disabled.',
      criticality: 'optional',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {},
      links: openAiDashboardUrl
        ? [
            {
              label: 'Open OpenAI dashboard',
              url: openAiDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Riser Policy API
    const riserConfigured = !!riserBaseUrl && !!riserKey;
    services.push({
      id: 'riser',
      name: 'Riser Policy API',
      category: 'policy',
      roleDescription:
        'Syncs company policies and manuals that ground the AI assistant for all users.',
      status: riserConfigured ? 'unknown' : 'not_configured',
      statusReason: riserConfigured
        ? 'Riser API base URL and key configured.'
        : 'RISER_API_BASE_URL or RISER_API_KEY not configured; policy sync disabled.',
      criticality: 'important',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {
        host: this.safeHostFromUrl(riserBaseUrl),
      },
      links: riserDashboardUrl
        ? [
            {
              label: 'Open Riser dashboard',
              url: riserDashboardUrl,
              kind: 'dashboard',
            },
          ]
        : [],
    });

    // Monitoring / Uptime
    const hasUptime = !!uptimeDashboardUrl;
    const hasSentry = !!sentryDashboardUrl;
    services.push({
      id: 'monitoring',
      name: 'Monitoring & Uptime',
      category: 'monitoring',
      roleDescription:
        'External uptime monitoring and error tracking for the ticketing system.',
      status: hasUptime || hasSentry ? 'unknown' : 'not_configured',
      statusReason:
        hasUptime || hasSentry
          ? 'Monitoring and/or uptime tools configured.'
          : 'No monitoring or uptime dashboards configured.',
      criticality: 'important',
      lastCheckedAt: nowIso,
      lastError: null,
      details: {},
      links: [
        ...(uptimeDashboardUrl
          ? [
              {
                label: 'Open uptime dashboard',
                url: uptimeDashboardUrl,
                kind: 'dashboard' as const,
              },
            ]
          : []),
        ...(sentryDashboardUrl
          ? [
              {
                label: 'Open Sentry dashboard',
                url: sentryDashboardUrl,
                kind: 'dashboard' as const,
              },
            ]
          : []),
      ],
    });

    return {
      environment: {
        name: envName,
        region,
        version,
      },
      services,
    };
  }

  // ─── Ticket taxonomy (Stage 2, read-only config) ──────────────────────────

  async getTicketTaxonomy() {
    const [ticketClasses, departments, supportTopics, maintenanceCategories] =
      await Promise.all([
        this.prisma.ticketClass.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true, name: true, sortOrder: true },
        }),
        this.prisma.taxonomyDepartment.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true, name: true, sortOrder: true },
        }),
        this.prisma.supportTopic.findMany({
          where: { isActive: true },
          orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
          select: {
            id: true,
            name: true,
            sortOrder: true,
            departmentId: true,
            department: { select: { id: true, code: true, name: true } },
          },
        }),
        this.prisma.maintenanceCategory.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            sortOrder: true,
          },
        }),
      ]);

    const supportTopicsByDepartment = departments.map((dept) => ({
      ...dept,
      topics: supportTopics
        .filter((t) => t.departmentId === dept.id)
        .map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
    }));

    return {
      ticketClasses,
      departments: departments.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        sortOrder: d.sortOrder,
      })),
      supportTopicsByDepartment,
      maintenanceCategories,
    };
  }

  // ─── Markets ─────────────────────────────────────────────────────────────

  /** Open maintenance tickets per studio (status not RESOLVED/CLOSED, ticket class MAINTENANCE). Returns count and category names per studio. */
  private async getActiveMaintenanceByStudio(
    studioIds: string[],
  ): Promise<Map<string, { count: number; categoryNames: string[] }>> {
    const empty = (): { count: number; categoryNames: string[] } => ({
      count: 0,
      categoryNames: [],
    });
    if (studioIds.length === 0) return new Map();
    const maintenanceClass = await this.prisma.ticketClass.findFirst({
      where: { code: 'MAINTENANCE' },
      select: { id: true },
    });
    const map = new Map<string, { count: number; categoryNames: string[] }>();
    for (const id of studioIds) map.set(id, empty());
    if (!maintenanceClass) return map;
    const tickets = await this.prisma.ticket.findMany({
      where: {
        studioId: { in: studioIds },
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        ticketClassId: maintenanceClass.id,
      },
      select: {
        studioId: true,
        maintenanceCategory: { select: { name: true } },
      },
    });
    for (const t of tickets) {
      if (t.studioId == null) continue;
      const cur = map.get(t.studioId) ?? empty();
      cur.count += 1;
      cur.categoryNames.push(
        t.maintenanceCategory?.name ?? 'Uncategorized',
      );
      map.set(t.studioId, cur);
    }
    return map;
  }

  async listMarkets() {
    const markets = await this.prisma.market.findMany({
      orderBy: { name: 'asc' },
      include: {
        studios: { orderBy: { name: 'asc' } },
      },
    });
    const studioIds = markets.flatMap((m) => m.studios.map((s) => s.id));
    const data = await this.getActiveMaintenanceByStudio(studioIds);
    return markets.map((m) => ({
      ...m,
      studios: m.studios.map((s) => {
        const d = data.get(s.id) ?? { count: 0, categoryNames: [] };
        return {
          ...s,
          activeMaintenanceCount: d.count,
          activeMaintenanceCategoryNames: d.categoryNames,
        };
      }),
    }));
  }

  async createMarket(dto: CreateMarketDto) {
    const existing = await this.prisma.market.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing)
      throw new ConflictException(`Market "${dto.name}" already exists`);

    return this.prisma.market.create({
      data: { name: dto.name },
      include: { studios: true },
    });
  }

  async updateMarket(id: string, dto: UpdateMarketDto) {
    await this.findMarketOrThrow(id);
    return this.prisma.market.update({
      where: { id },
      data: { ...(dto.name && { name: dto.name }) },
      include: { studios: true },
    });
  }

  private async findMarketOrThrow(id: string) {
    const market = await this.prisma.market.findUnique({ where: { id } });
    if (!market) throw new NotFoundException(`Market ${id} not found`);
    return market;
  }

  // ─── Studios ─────────────────────────────────────────────────────────────

  async listStudios(marketId?: string) {
    return this.prisma.studio.findMany({
      where: marketId ? { marketId } : undefined,
      orderBy: { name: 'asc' },
      include: { market: true },
    });
  }

  async createStudio(dto: CreateStudioDto) {
    await this.findMarketOrThrow(dto.marketId);

    const name = dto.name.trim();
    const formattedAddress = dto.formattedAddress.trim();
    if (!name)
      throw new BadRequestException('name must be non-empty after trim');
    if (!formattedAddress)
      throw new BadRequestException(
        'formattedAddress must be non-empty after trim',
      );

    const existing = await this.prisma.studio.findFirst({
      where: {
        marketId: dto.marketId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    if (existing)
      throw new ConflictException(
        `Studio "${name}" already exists in this market`,
      );

    return this.prisma.studio.create({
      data: {
        name,
        marketId: dto.marketId,
        formattedAddress,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
      include: { market: true },
    });
  }

  async updateStudio(id: string, dto: UpdateStudioDto) {
    const studio = await this.prisma.studio.findUnique({ where: { id } });
    if (!studio) throw new NotFoundException(`Studio ${id} not found`);

    if (studio.latitude != null && dto.latitude === null) {
      throw new BadRequestException(
        'Latitude cannot be removed once set; update with a new value or omit to keep existing.',
      );
    }
    if (studio.longitude != null && dto.longitude === null) {
      throw new BadRequestException(
        'Longitude cannot be removed once set; update with a new value or omit to keep existing.',
      );
    }

    const data: {
      name?: string;
      formattedAddress?: string;
      latitude?: number;
      longitude?: number;
      externalCode?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.name != null) {
      const trimmed = dto.name.trim();
      if (!trimmed)
        throw new BadRequestException('name must be non-empty after trim');
      data.name = trimmed;
    }
    if (dto.formattedAddress != null) {
      const trimmed = dto.formattedAddress.trim();
      if (!trimmed)
        throw new BadRequestException(
          'formattedAddress must be non-empty after trim',
        );
      data.formattedAddress = trimmed;
    }
    if (typeof dto.latitude === 'number') data.latitude = dto.latitude;
    if (typeof dto.longitude === 'number') data.longitude = dto.longitude;

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.externalCode !== undefined) {
      let code: string | null;
      if (dto.externalCode === null) {
        code = null;
      } else {
        const t = dto.externalCode.trim();
        code = t === '' ? null : t;
      }
      if (code !== null) {
        const taken = await this.prisma.studio.findFirst({
          where: { externalCode: code, NOT: { id } },
        });
        if (taken) {
          throw new ConflictException(
            `externalCode "${code}" is already in use by another location`,
          );
        }
      }
      data.externalCode = code;
    }

    return this.prisma.studio.update({
      where: { id },
      data,
      include: { market: true },
    });
  }

  async upsertStudioProfile(studioId: string, dto: UpsertStudioProfileDto) {
    const studio = await this.prisma.studio.findUnique({ where: { id: studioId } });
    if (!studio) throw new NotFoundException(`Studio ${studioId} not found`);

    const trim = (s: string): string | null => {
      const t = s.trim();
      return t === '' ? null : t;
    };

    const parseDate = (v: string | null | undefined): Date | null => {
      if (v === null) return null;
      if (v === undefined) return null;
      if (v.trim() === '') return null;
      const d = new Date(`${v.trim()}T12:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid date; use YYYY-MM-DD');
      }
      return d;
    };

    const patch: Record<string, string | number | Date | null> = {};

    if (dto.district !== undefined) patch.district = trim(dto.district);
    if (dto.status !== undefined) patch.status = trim(dto.status);
    if (dto.maturity !== undefined) patch.maturity = trim(dto.maturity);
    if (dto.openType !== undefined) patch.openType = trim(dto.openType);

    if (dto.studioSize !== undefined) {
      patch.studioSize = dto.studioSize as number | null;
    }
    if (dto.priceTier !== undefined) {
      patch.priceTier = dto.priceTier as number | null;
    }

    if (dto.studioOpenDate !== undefined) {
      patch.studioOpenDate = parseDate(dto.studioOpenDate);
    }
    if (dto.rfSoftOpenDate !== undefined) {
      patch.rfSoftOpenDate = parseDate(dto.rfSoftOpenDate);
    }

    if (dto.dm !== undefined) patch.dm = trim(dto.dm);
    if (dto.gm !== undefined) patch.gm = trim(dto.gm);
    if (dto.agm !== undefined) patch.agm = trim(dto.agm);
    if (dto.edc !== undefined) patch.edc = trim(dto.edc);
    if (dto.li !== undefined) patch.li = trim(dto.li);

    if (dto.studioEmail !== undefined) patch.studioEmail = trim(dto.studioEmail);
    if (dto.gmEmail !== undefined) patch.gmEmail = trim(dto.gmEmail);
    if (dto.gmTeams !== undefined) patch.gmTeams = trim(dto.gmTeams);
    if (dto.liEmail !== undefined) patch.liEmail = trim(dto.liEmail);

    if (dto.studioCode !== undefined) patch.studioCode = trim(dto.studioCode);
    if (dto.netsuiteName !== undefined) patch.netsuiteName = trim(dto.netsuiteName);
    if (dto.ikismetName !== undefined) patch.ikismetName = trim(dto.ikismetName);
    if (dto.crName !== undefined) patch.crName = trim(dto.crName);
    if (dto.crId !== undefined) patch.crId = trim(dto.crId);
    if (dto.paycomCode !== undefined) patch.paycomCode = trim(dto.paycomCode);

    return this.prisma.studioProfile.upsert({
      where: { studioId },
      create: { studioId, ...patch },
      update: patch as Prisma.StudioProfileUpdateInput,
    });
  }

  /** Studios within radiusMiles of the given studio (Haversine). Target and results must have coordinates. Max 50 results. */
  async getNearbyStudios(
    studioId: string,
    radiusMiles: number,
  ): Promise<
    {
      id: string;
      name: string;
      formattedAddress: string | null;
      marketName: string;
      distanceMiles: number;
      activeMaintenanceCount: number;
      activeMaintenanceCategoryNames: string[];
    }[]
  > {
    const target = await this.prisma.studio.findUnique({
      where: { id: studioId },
      select: { id: true, latitude: true, longitude: true },
    });
    if (!target) throw new NotFoundException(`Studio ${studioId} not found`);
    if (target.latitude == null || target.longitude == null) {
      throw new NotFoundException(
        'This studio has no coordinates; nearby search is not available.',
      );
    }

    const others = await this.prisma.studio.findMany({
      where: {
        id: { not: studioId },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        name: true,
        formattedAddress: true,
        latitude: true,
        longitude: true,
        market: { select: { name: true } },
      },
    });

    const results: {
      id: string;
      name: string;
      formattedAddress: string | null;
      marketName: string;
      distanceMiles: number;
    }[] = [];
    for (const s of others) {
      const lat = s.latitude!;
      const lon = s.longitude!;
      const dist = haversineMiles(target.latitude, target.longitude, lat, lon);
      if (dist <= radiusMiles) {
        results.push({
          id: s.id,
          name: s.name,
          formattedAddress: s.formattedAddress,
          marketName: s.market.name,
          distanceMiles: Math.round(dist * 10) / 10,
        });
      }
    }
    results.sort((a, b) => a.distanceMiles - b.distanceMiles);
    const top = results.slice(0, 50);
    const data = await this.getActiveMaintenanceByStudio(top.map((r) => r.id));
    return top.map((r) => {
      const d = data.get(r.id) ?? { count: 0, categoryNames: [] };
      return {
        ...r,
        activeMaintenanceCount: d.count,
        activeMaintenanceCategoryNames: d.categoryNames,
      };
    });
  }
}
