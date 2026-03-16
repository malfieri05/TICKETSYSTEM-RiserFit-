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
   * Parse the latest source for the studio and create a new DRAFT ruleset.
   * Does not overwrite existing rules on parse failure; raw source is already stored.
   */
  async parseLatestForStudio(studioId: string): Promise<{ rulesetId: string }> {
    const source = await this.leaseSource.getLatestForStudio(studioId);
    if (!source) {
      throw new BadRequestException(
        'No source found for this studio. Upload a PDF or paste extraction first.',
      );
    }
    if (!source.rawText || !source.rawText.trim()) {
      throw new BadRequestException(
        'Latest source has no text to parse. Paste extraction or ensure PDF text was extracted.',
      );
    }

    const rules: ParsedRuleDto[] = parsePastedExtraction(source.rawText);
    const ruleset = await this.leaseRuleSet.createDraftFromParse(
      studioId,
      source.id,
      rules,
    );
    return { rulesetId: ruleset.id };
  }
}
