import { Injectable } from '@nestjs/common';

/**
 * Lightweight dictionary-based normalization before rule term matching.
 * Applied to ticket text and to each lease rule term so both sides align.
 * No AI or complex NLP.
 */
const NORMALIZATION_MAP: [string | RegExp, string][] = [
  [/\bA\/C\b/gi, 'HVAC'],
  [/\bAC\b/gi, 'HVAC'],
  [/\bair conditioner(s)?\b/gi, 'HVAC'],
  [/\bair conditioning\b/gi, 'HVAC'],
  [/\bHVAC\b/gi, 'HVAC'],
  [/\bheater(s)?\b/gi, 'HVAC'],
  [/\bfurnace(s)?\b/gi, 'HVAC'],
  [/\bchiller(s)?\b/gi, 'HVAC'],
  [/\bRTU(s)?\b/gi, 'HVAC'],
  [/\bFAU(s)?\b/gi, 'HVAC'],
  [/\brestroom(s)?\b/gi, 'bathroom'],
  [/\bwashroom(s)?\b/gi, 'bathroom'],
  [/\btoilet(s)?\b/gi, 'bathroom'],
  [/\bWC\b/gi, 'bathroom'],
  [/\bplumb(er|ing|ers)?\b/gi, 'plumbing'],
  [/\bdrain(s|age)?\b/gi, 'drain'],
  [/\bsink(s)?\b/gi, 'sink'],
  [/\belectric(al|ian|ians)?\b/gi, 'electrical'],
  [/\boutlet(s)?\b/gi, 'outlet'],
  [/\bwiring\b/gi, 'electrical'],
  [/\broof(ing)?\b/gi, 'roof'],
  [/\bceiling(s)?\b/gi, 'ceiling'],
  [/\bwindow(s)?\b/gi, 'window'],
  [/\bdoor(s)?\b/gi, 'door'],
  [/\block(s|ed|smith)?\b/gi, 'lock'],
  [/\bpaint(ing)?\b/gi, 'paint'],
  [/\bleak(s|ing|y)?\b/gi, 'leak'],
  [/\brepair(s|ing)?\b/gi, 'repair'],
  [/\bmaintenan(ce|t)\b/gi, 'maintenance'],
  [/\belevator(s)?\b/gi, 'elevator'],
  [/\blift(s)?\b/gi, 'elevator'],
  [/\bsprinkler(s)?\b/gi, 'sprinkler'],
  [/\bfire alarm(s)?\b/gi, 'fire alarm'],
  [/\bpest(s)?\b/gi, 'pest'],
  [/\bexterminat(e|ion|or)\b/gi, 'pest'],
  [/\blandscap(e|ing)\b/gi, 'landscaping'],
  [/\bparking lot(s)?\b/gi, 'parking'],
  [/\basphalt\b/gi, 'parking'],
];

@Injectable()
export class TextNormalizerService {
  /**
   * Combine title and description then apply dictionary normalization.
   */
  normalize(title: string, description: string): string {
    return this.normalizeFragment(`${title ?? ''} ${description ?? ''}`.trim());
  }

  /**
   * Apply the same replacements to arbitrary text (e.g. lease rule terms).
   */
  normalizeFragment(text: string): string {
    let out = text ?? '';
    for (const [from, to] of NORMALIZATION_MAP) {
      out = out.replace(from, to);
    }
    return out;
  }
}
