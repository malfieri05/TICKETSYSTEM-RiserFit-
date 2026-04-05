import { Injectable, BadRequestException } from '@nestjs/common';
import { LeaseSourceService } from './lease-source.service';
import { LeaseRuleSetService } from './lease-rule-set.service';
import { parsePastedExtraction } from '../adapters/pasted-extraction.adapter';
import { ParsedRuleDto } from '../dto/lease-iq.dto';

@Injectable()
export class LeaseParseService {
  constructor(
    private readonly leaseSource: LeaseSourceService,
    private readonly leaseRuleSet: LeaseRuleSetService,
  ) {}

  /**
   * Parse one or more saved sources (text concatenated in request order) into a new DRAFT ruleset.
   */
  async parseSourcesForStudio(
    studioId: string,
    sourceIds: string[],
  ): Promise<{ rulesetId: string }> {
    const unique = [...new Set(sourceIds)];
    if (unique.length === 0) {
      throw new BadRequestException(
        'Select at least one saved lease source to parse.',
      );
    }

    const rows = await this.leaseSource.getManyByStudioIds(studioId, unique);
    if (rows.length !== unique.length) {
      throw new BadRequestException(
        'One or more selected sources were not found for this location.',
      );
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = unique.map((id) => byId.get(id)!);
    const pieces = ordered.map((s) => (s.rawText ?? '').trim()).filter(Boolean);
    const combined = pieces.join('\n\n---\n\n');

    if (!combined.trim()) {
      throw new BadRequestException(
        'Selected sources have no extractable text to parse.',
      );
    }

    const rules: ParsedRuleDto[] = parsePastedExtraction(combined);
    const sourceIdForRuleset = unique.length === 1 ? unique[0] : null;
    const ruleset = await this.leaseRuleSet.createDraftFromParse(
      studioId,
      sourceIdForRuleset,
      rules,
    );
    return { rulesetId: ruleset.id };
  }
}
