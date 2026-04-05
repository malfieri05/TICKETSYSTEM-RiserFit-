import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  LeaseRuleType,
  LeaseRuleTermType,
  SuggestedResponsibility,
  LeaseIQResultState,
  LeaseIQConfidence,
  EvaluationTrigger,
} from '@prisma/client';
import { TextNormalizerService } from './text-normalizer.service';
import { LeaseRuleSetService } from './lease-rule-set.service';

interface RuleWithTerms {
  id: string;
  ruleType: LeaseRuleType;
  categoryScope: string | null;
  priority: number;
  terms: { id: string; term: string; termType: LeaseRuleTermType }[];
}

@Injectable()
export class LeaseEvaluationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: TextNormalizerService,
    private readonly leaseRuleSetService: LeaseRuleSetService,
  ) {}

  /**
   * Evaluate a ticket and persist the result. Call after ticket create or on manual re-evaluate.
   * Does not throw on failure; stores NEEDS_HUMAN_REVIEW or NO_RULES_CONFIGURED as appropriate.
   */
  async evaluate(ticketId: string, trigger: EvaluationTrigger): Promise<void> {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          title: true,
          description: true,
          studioId: true,
          maintenanceCategoryId: true,
          ticketClassId: true,
        },
      });
      if (!ticket?.studioId) return;
      const maintenanceClassCode = await this.getTicketClassCode(ticket.ticketClassId);
      if (maintenanceClassCode !== 'MAINTENANCE') return;

      const ruleset = await this.leaseRuleSetService.getPublishedForStudio(ticket.studioId);
      if (!ruleset) {
        await this.upsertResult(ticketId, null, {
          suggestedResponsibility: SuggestedResponsibility.NEEDS_HUMAN_REVIEW,
          internalResultState: LeaseIQResultState.NO_RULES_CONFIGURED,
          confidence: LeaseIQConfidence.LOW,
          matchedRuleIds: [],
          matchedTerms: [],
          matchedCategory: null,
          explanation: 'No published lease rules configured for this location.',
          evaluationTrigger: trigger,
        });
        return;
      }

      const normalizedText = this.normalizer.normalize(ticket.title, ticket.description);
      const rules = ruleset.rules as unknown as RuleWithTerms[];
      const matched = this.matchRules(rules, normalizedText, ticket.maintenanceCategoryId ?? null);

      if (matched.length === 0) {
        await this.upsertResult(ticketId, ruleset.id, {
          suggestedResponsibility: SuggestedResponsibility.NEEDS_HUMAN_REVIEW,
          internalResultState: LeaseIQResultState.NO_MATCH,
          confidence: LeaseIQConfidence.LOW,
          matchedRuleIds: [],
          matchedTerms: [],
          matchedCategory: null,
          explanation: 'No lease rules matched this ticket.',
          evaluationTrigger: trigger,
        });
        return;
      }

      const hasShared = matched.some((m) => m.ruleType === LeaseRuleType.SHARED_OR_AMBIGUOUS);
      const landlordRules = matched.filter((m) => m.ruleType === LeaseRuleType.LANDLORD_RESPONSIBILITY);
      const tenantRules = matched.filter((m) => m.ruleType === LeaseRuleType.TENANT_RESPONSIBILITY);

      let suggestedResponsibility: SuggestedResponsibility;
      let internalResultState: LeaseIQResultState;
      let confidence: LeaseIQConfidence;
      let explanation: string;

      if (hasShared) {
        suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
        internalResultState = LeaseIQResultState.AMBIGUOUS;
        confidence = LeaseIQConfidence.LOW;
        explanation = 'A shared or ambiguous lease rule matched; human review recommended.';
      } else if (landlordRules.length > 0 && tenantRules.length > 0) {
        suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
        internalResultState = LeaseIQResultState.AMBIGUOUS;
        confidence = LeaseIQConfidence.LOW;
        explanation = 'Both landlord and tenant rules matched; human review recommended.';
      } else if (landlordRules.length > 0) {
        suggestedResponsibility = SuggestedResponsibility.LIKELY_LANDLORD;
        internalResultState = LeaseIQResultState.RESOLVED;
        confidence = this.computeConfidence(matched, true);
        explanation = `Matched ${landlordRules.length} landlord rule(s).`;
      } else if (tenantRules.length > 0) {
        suggestedResponsibility = SuggestedResponsibility.LIKELY_TENANT;
        internalResultState = LeaseIQResultState.RESOLVED;
        confidence = this.computeConfidence(matched, true);
        explanation = `Matched ${tenantRules.length} tenant rule(s).`;
      } else {
        suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
        internalResultState = LeaseIQResultState.NO_MATCH;
        confidence = LeaseIQConfidence.LOW;
        explanation = 'No applicable rules matched.';
      }

      const allMatchedRuleIds = matched.map((m) => m.ruleId);
      const allMatchedTerms = matched.flatMap((m) => m.matchedTerms);
      const matchedCategory = matched[0]?.categoryScope ?? null;

      await this.upsertResult(ticketId, ruleset.id, {
        suggestedResponsibility,
        internalResultState,
        confidence,
        matchedRuleIds: allMatchedRuleIds,
        matchedTerms: allMatchedTerms,
        matchedCategory,
        explanation,
        evaluationTrigger: trigger,
      });
    } catch (err) {
      // Do not fail ticket create; log and optionally persist a failure result
      if (typeof (err as Error).message === 'string') {
        console.error(`Lease IQ evaluation failed for ticket ${ticketId}:`, (err as Error).message);
      }
    }
  }

  async getResultForTicket(ticketId: string) {
    return this.prisma.ticketLeaseIqResult.findUnique({
      where: { ticketId },
    });
  }

  /**
   * Run evaluation for playground (no ticket persist). Returns result DTO.
   */
  async evaluateForPlayground(
    studioId: string,
    maintenanceCategoryId: string | null,
    title: string,
    description: string,
  ): Promise<{
    suggestedResponsibility: SuggestedResponsibility;
    confidence: LeaseIQConfidence;
    internalResultState?: LeaseIQResultState | null;
    matchedRuleIds: string[];
    matchedTerms: string[];
    matchedCategory: string | null;
    explanation: string;
    ruleSetId: string | null;
  }> {
    const ruleset = await this.leaseRuleSetService.getPublishedForStudio(studioId);
    if (!ruleset) {
      return {
        suggestedResponsibility: SuggestedResponsibility.NEEDS_HUMAN_REVIEW,
        confidence: LeaseIQConfidence.LOW,
        internalResultState: LeaseIQResultState.NO_RULES_CONFIGURED,
        matchedRuleIds: [],
        matchedTerms: [],
        matchedCategory: null,
        explanation: 'No published lease rules configured for this location.',
        ruleSetId: null,
      };
    }

    const normalizedText = this.normalizer.normalize(title, description);
    const rules = ruleset.rules as unknown as RuleWithTerms[];
    const matched = this.matchRules(rules, normalizedText, maintenanceCategoryId);

    if (matched.length === 0) {
      return {
        suggestedResponsibility: SuggestedResponsibility.NEEDS_HUMAN_REVIEW,
        confidence: LeaseIQConfidence.LOW,
        internalResultState: LeaseIQResultState.NO_MATCH,
        matchedRuleIds: [],
        matchedTerms: [],
        matchedCategory: null,
        explanation: 'No lease rules matched.',
        ruleSetId: ruleset.id,
      };
    }

    const hasShared = matched.some((m) => m.ruleType === LeaseRuleType.SHARED_OR_AMBIGUOUS);
    const landlordRules = matched.filter((m) => m.ruleType === LeaseRuleType.LANDLORD_RESPONSIBILITY);
    const tenantRules = matched.filter((m) => m.ruleType === LeaseRuleType.TENANT_RESPONSIBILITY);

    let suggestedResponsibility: SuggestedResponsibility;
    let internalResultState: LeaseIQResultState;
    let confidence: LeaseIQConfidence;
    let explanation: string;

    if (hasShared) {
      suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
      internalResultState = LeaseIQResultState.AMBIGUOUS;
      confidence = LeaseIQConfidence.LOW;
      explanation = 'A shared or ambiguous lease rule matched; human review recommended.';
    } else if (landlordRules.length > 0 && tenantRules.length > 0) {
      suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
      internalResultState = LeaseIQResultState.AMBIGUOUS;
      confidence = LeaseIQConfidence.LOW;
      explanation = 'Both landlord and tenant rules matched; human review recommended.';
    } else if (landlordRules.length > 0) {
      suggestedResponsibility = SuggestedResponsibility.LIKELY_LANDLORD;
      internalResultState = LeaseIQResultState.RESOLVED;
      confidence = this.computeConfidence(matched, true);
      explanation = `Matched ${landlordRules.length} landlord rule(s).`;
    } else if (tenantRules.length > 0) {
      suggestedResponsibility = SuggestedResponsibility.LIKELY_TENANT;
      internalResultState = LeaseIQResultState.RESOLVED;
      confidence = this.computeConfidence(matched, true);
      explanation = `Matched ${tenantRules.length} tenant rule(s).`;
    } else {
      suggestedResponsibility = SuggestedResponsibility.NEEDS_HUMAN_REVIEW;
      internalResultState = LeaseIQResultState.NO_MATCH;
      confidence = LeaseIQConfidence.LOW;
      explanation = 'No applicable rules matched.';
    }

    return {
      suggestedResponsibility,
      confidence,
      internalResultState,
      matchedRuleIds: matched.map((m) => m.ruleId),
      matchedTerms: matched.flatMap((m) => m.matchedTerms),
      matchedCategory: matched[0]?.categoryScope ?? null,
      explanation,
      ruleSetId: ruleset.id,
    };
  }

  private async getTicketClassCode(ticketClassId: string): Promise<string> {
    const tc = await this.prisma.ticketClass.findUnique({
      where: { id: ticketClassId },
      select: { code: true },
    });
    return tc?.code ?? '';
  }

  private matchRules(
    rules: RuleWithTerms[],
    normalizedText: string,
    maintenanceCategoryId: string | null,
  ): Array<
    {
      ruleId: string;
      ruleType: LeaseRuleType;
      categoryScope: string | null;
      priority: number;
      matchCount: number;
      matchedTerms: string[];
    }
  > {
    const lower = normalizedText.toLowerCase();
    const results: Array<{
      ruleId: string;
      ruleType: LeaseRuleType;
      categoryScope: string | null;
      priority: number;
      matchCount: number;
      matchedTerms: string[];
    }> = [];

    for (const rule of rules) {
      const categoryMatch =
        rule.categoryScope == null || rule.categoryScope === maintenanceCategoryId;
      if (!categoryMatch) continue;

      let matchCount = 0;
      const matchedTerms: string[] = [];
      for (const t of rule.terms) {
        const termNorm = this.normalizer.normalizeFragment(t.term).trim().toLowerCase();
        if (!termNorm) continue;

        const found =
          t.termType === LeaseRuleTermType.KEYWORD
            ? this.termMatchesKeyword(lower, termNorm)
            : lower.includes(termNorm);

        if (found) {
          matchCount++;
          matchedTerms.push(t.term);
        }
      }
      if (matchCount > 0) {
        results.push({
          ruleId: rule.id,
          ruleType: rule.ruleType,
          categoryScope: rule.categoryScope,
          priority: rule.priority,
          matchCount,
          matchedTerms,
        });
      }
    }

    results.sort((a, b) => {
      const aCat = a.categoryScope != null ? 1 : 0;
      const bCat = b.categoryScope != null ? 1 : 0;
      if (bCat !== aCat) return bCat - aCat;
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.matchCount - a.matchCount;
    });
    return results;
  }

  /**
   * Whole-token match to avoid substring false positives (e.g. "ac" in "vacation").
   * Uses Unicode-aware boundaries for letters/digits; terms should already be normalized + lowercased.
   */
  private termMatchesKeyword(haystackLower: string, termLower: string): boolean {
    if (!termLower) return false;
    if (/[^\p{L}\p{N}_-]/u.test(termLower)) {
      return haystackLower.includes(termLower);
    }
    const escaped = termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
    return re.test(haystackLower);
  }

  private computeConfidence(
    matched: Array<{ categoryScope: string | null; priority: number }>,
    singleType: boolean,
  ): LeaseIQConfidence {
    if (!singleType) return LeaseIQConfidence.LOW;
    const hasCategory = matched.some((m) => m.categoryScope != null);
    const highPriority = matched.some((m) => m.priority >= 10);
    if (hasCategory && highPriority) return LeaseIQConfidence.HIGH;
    if (hasCategory || highPriority) return LeaseIQConfidence.MEDIUM;
    return LeaseIQConfidence.LOW;
  }

  private async upsertResult(
    ticketId: string,
    ruleSetId: string | null,
    data: {
      suggestedResponsibility: SuggestedResponsibility;
      internalResultState: LeaseIQResultState;
      confidence: LeaseIQConfidence;
      matchedRuleIds: string[];
      matchedTerms: string[];
      matchedCategory: string | null;
      explanation: string;
      evaluationTrigger: EvaluationTrigger;
    },
  ) {
    await this.prisma.ticketLeaseIqResult.upsert({
      where: { ticketId },
      create: {
        ticketId,
        ruleSetId,
        suggestedResponsibility: data.suggestedResponsibility,
        internalResultState: data.internalResultState,
        confidence: data.confidence,
        matchedRuleIds: data.matchedRuleIds,
        matchedTerms: data.matchedTerms,
        matchedCategory: data.matchedCategory,
        explanation: data.explanation,
        evaluationTrigger: data.evaluationTrigger,
      },
      update: {
        ruleSetId,
        suggestedResponsibility: data.suggestedResponsibility,
        internalResultState: data.internalResultState,
        confidence: data.confidence,
        matchedRuleIds: data.matchedRuleIds,
        matchedTerms: data.matchedTerms,
        matchedCategory: data.matchedCategory,
        explanation: data.explanation,
        evaluationTrigger: data.evaluationTrigger,
      },
    });
  }
}
