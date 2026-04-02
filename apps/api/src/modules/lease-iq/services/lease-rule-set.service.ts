import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  LeaseRuleSetStatus,
  LeaseRuleType,
} from '@prisma/client';
import { LeaseRuleDto, ParsedRuleDto } from '../dto/lease-iq.dto';

type Tx = Parameters<PrismaService['$transaction']>[0] extends (tx: infer T) => unknown ? T : never;

@Injectable()
export class LeaseRuleSetService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(
    studioId: string,
    sourceId?: string | null,
    publishedByUserId?: string | null,
  ) {
    const ruleset = await this.prisma.leaseRuleSet.create({
      data: {
        studioId,
        sourceId: sourceId ?? null,
        status: LeaseRuleSetStatus.DRAFT,
      },
    });
    return ruleset;
  }

  async createDraftFromParse(
    studioId: string,
    sourceId: string,
    rules: ParsedRuleDto[],
  ) {
    const ruleset = await this.createDraft(studioId, sourceId);

    for (const r of rules) {
      await this.prisma.leaseRule.create({
        data: {
          ruleSetId: ruleset.id,
          ruleType: r.ruleType,
          categoryScope: r.categoryScope,
          clauseReference: r.clauseReference,
          notes: r.notes,
          priority: r.priority,
          terms: {
            create: r.terms.map((t) => ({
              term: t.term,
              termType: t.termType,
            })),
          },
        },
        include: { terms: true },
      });
    }

    return this.getRulesetWithRulesAndTerms(ruleset.id);
  }

  async getRulesetsByStudio(studioId: string) {
    return this.prisma.leaseRuleSet.findMany({
      where: { studioId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rules: true } },
      },
    });
  }

  /** Studio IDs that have a non-archived ruleset (draft or published). */
  async getStudioIdsWithActiveRulesets(): Promise<string[]> {
    const grouped = await this.prisma.leaseRuleSet.groupBy({
      by: ['studioId'],
      where: {
        status: {
          in: [LeaseRuleSetStatus.DRAFT, LeaseRuleSetStatus.PUBLISHED],
        },
      },
    });
    return grouped.map((g) => g.studioId);
  }

  /** Studio IDs with a currently published ruleset. */
  async getStudioIdsWithPublishedRulesets(): Promise<string[]> {
    const grouped = await this.prisma.leaseRuleSet.groupBy({
      by: ['studioId'],
      where: { status: LeaseRuleSetStatus.PUBLISHED },
    });
    return grouped.map((g) => g.studioId);
  }

  async getRulesetWithRulesAndTerms(rulesetId: string) {
    const ruleset = await this.prisma.leaseRuleSet.findUnique({
      where: { id: rulesetId },
      include: {
        rules: {
          include: { terms: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!ruleset) throw new NotFoundException(`Ruleset ${rulesetId} not found`);
    return ruleset;
  }

  async getPublishedForStudio(studioId: string) {
    return this.prisma.leaseRuleSet.findFirst({
      where: { studioId, status: LeaseRuleSetStatus.PUBLISHED },
      include: {
        rules: {
          include: { terms: true },
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async updateRulesAndTerms(rulesetId: string, dto: { rules: LeaseRuleDto[] }) {
    const ruleset = await this.prisma.leaseRuleSet.findUnique({
      where: { id: rulesetId },
      include: { rules: true },
    });
    if (!ruleset) throw new NotFoundException(`Ruleset ${rulesetId} not found`);
    if (ruleset.status !== LeaseRuleSetStatus.DRAFT) {
      throw new BadRequestException('Can only edit a DRAFT ruleset');
    }

    await this.prisma.$transaction(async (tx: Tx) => {
      await tx.leaseRuleTerm.deleteMany({
        where: { rule: { ruleSetId: rulesetId } },
      });
      await tx.leaseRule.deleteMany({
        where: { ruleSetId: rulesetId },
      });

      for (const r of dto.rules) {
        const rule = await tx.leaseRule.create({
          data: {
            ruleSetId: rulesetId,
            ruleType: r.ruleType,
            categoryScope: r.categoryScope ?? null,
            clauseReference: r.clauseReference ?? null,
            notes: r.notes ?? null,
            priority: r.priority ?? 0,
          },
        });
        for (const t of r.terms) {
          await tx.leaseRuleTerm.create({
            data: {
              ruleId: rule.id,
              term: t.term,
              termType: t.termType,
            },
          });
        }
      }
    });

    return this.getRulesetWithRulesAndTerms(rulesetId);
  }

  async publish(studioId: string, rulesetId: string, publishedByUserId?: string) {
    const ruleset = await this.prisma.leaseRuleSet.findUnique({
      where: { id: rulesetId },
      include: { _count: { select: { rules: true } } },
    });
    if (!ruleset) throw new NotFoundException(`Ruleset ${rulesetId} not found`);
    if (ruleset.studioId !== studioId) {
      throw new BadRequestException('Ruleset does not belong to this studio');
    }
    if (ruleset.status !== LeaseRuleSetStatus.DRAFT) {
      throw new BadRequestException('Only a DRAFT ruleset can be published');
    }
    if (ruleset._count.rules === 0) {
      throw new BadRequestException('Cannot publish a ruleset with zero rules');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Tx) => {
      await tx.leaseRuleSet.updateMany({
        where: { studioId, status: LeaseRuleSetStatus.PUBLISHED },
        data: { status: LeaseRuleSetStatus.ARCHIVED },
      });
      await tx.leaseRuleSet.update({
        where: { id: rulesetId },
        data: {
          status: LeaseRuleSetStatus.PUBLISHED,
          publishedAt: now,
          publishedByUserId: publishedByUserId ?? null,
        },
      });
    });

    return this.getRulesetWithRulesAndTerms(rulesetId);
  }
}
