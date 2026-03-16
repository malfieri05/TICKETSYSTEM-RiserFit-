import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { AssemblyTriggerMatchMode } from '@prisma/client';

export interface AssemblyMatchResult {
  matched: boolean;
  matchedItemIds: string[];
  matchedKeywords: string[];
  /** Which line item strings matched (for logging). */
  matchedLineItemNames: string[];
}

/**
 * Checks line items against the assembly_trigger_items list (matchMode: SUBSTRING | EXACT_OR_FUZZY_ALIAS).
 */
@Injectable()
export class AssemblyTriggerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate line item names against active assembly trigger rules.
   * Returns which rules matched and which line items triggered.
   */
  async matchLineItems(lineItemNames: string[]): Promise<AssemblyMatchResult> {
    const rules = await this.prisma.assemblyTriggerItem.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, keywordOrPhrase: true, matchMode: true },
    });

    const matchedItemIds: string[] = [];
    const matchedKeywords: string[] = [];
    const matchedLineItemNames: string[] = [];

    for (const name of lineItemNames) {
      const normalizedName = name.toLowerCase().trim();
      for (const rule of rules) {
        const keyword = rule.keywordOrPhrase.toLowerCase().trim();
        let matches = false;
        if (rule.matchMode === AssemblyTriggerMatchMode.SUBSTRING) {
          matches = normalizedName.includes(keyword) || keyword.includes(normalizedName);
        } else {
          // EXACT_OR_FUZZY_ALIAS: exact match or fuzzy (normalize spaces, allow small diffs)
          const exact = normalizedName === keyword;
          const fuzzy =
            normalizedName.replace(/\s+/g, ' ').includes(keyword.replace(/\s+/g, ' ')) ||
            keyword.split(/\s+/).every((word) => normalizedName.includes(word));
          matches = exact || fuzzy;
        }
        if (matches) {
          if (!matchedItemIds.includes(rule.id)) matchedItemIds.push(rule.id);
          if (!matchedKeywords.includes(rule.keywordOrPhrase)) matchedKeywords.push(rule.keywordOrPhrase);
          if (!matchedLineItemNames.includes(name)) matchedLineItemNames.push(name);
        }
      }
    }

    return {
      matched: matchedItemIds.length > 0,
      matchedItemIds,
      matchedKeywords,
      matchedLineItemNames,
    };
  }
}
