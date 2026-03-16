import { Injectable } from '@nestjs/common';

/**
 * Lightweight dictionary-based normalization of ticket text before rule term matching.
 * Improves matching for common wording variations (e.g. AC → HVAC, restroom → bathroom).
 * No AI or complex NLP.
 */
const NORMALIZATION_MAP: [string | RegExp, string][] = [
  [/\bA\/C\b/gi, 'HVAC'],
  [/\bAC\b/gi, 'HVAC'],
  [/\bair conditioner(s)?\b/gi, 'HVAC'],
  [/\bheater(s)?\b/gi, 'HVAC'],
  [/\brestroom(s)?\b/gi, 'bathroom'],
  [/\btoilet(s)?\b/gi, 'bathroom'],
];

@Injectable()
export class TextNormalizerService {
  /**
   * Combine title and description then apply dictionary normalization.
   * Used only for rule term matching; rule terms are not normalized.
   */
  normalize(title: string, description: string): string {
    let text = `${title ?? ''} ${description ?? ''}`.trim();
    for (const [from, to] of NORMALIZATION_MAP) {
      text = text.replace(from, to);
    }
    return text;
  }
}
