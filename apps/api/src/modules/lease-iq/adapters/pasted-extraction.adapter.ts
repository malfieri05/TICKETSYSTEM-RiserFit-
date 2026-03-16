import { LeaseRuleType, LeaseRuleTermType } from '@prisma/client';
import { ParsedRuleDto } from '../dto/lease-iq.dto';

/**
 * Parses pasted lease extraction text into rules and terms.
 * Simple format: section headers (Landlord / Tenant / Shared) followed by lines of terms.
 * Example:
 *   ## Landlord
 *   HVAC
 *   plumbing
 *   ## Tenant
 *   minor repairs
 */
export function parsePastedExtraction(rawText: string): ParsedRuleDto[] {
  const rules: ParsedRuleDto[] = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let currentType: LeaseRuleType | null = null;
  let currentTerms: { term: string; termType: LeaseRuleTermType }[] = [];

  const flush = () => {
    if (currentType && currentTerms.length > 0) {
      rules.push({
        ruleType: currentType,
        categoryScope: null,
        clauseReference: null,
        notes: null,
        priority: 0,
        terms: currentTerms,
      });
      currentTerms = [];
    }
  };

  for (const line of lines) {
    const type = detectRuleType(line);
    if (type) {
      flush();
      currentType = type;
      const rest = line.replace(/^#+\s*/i, '').replace(/^(landlord|tenant|shared)\s*:?\s*/i, '').trim();
      if (rest) {
        currentTerms = splitTerms(rest);
      }
      continue;
    }
    if (currentType) {
      currentTerms.push(...splitTerms(line));
    }
  }
  flush();

  if (rules.length === 0) {
    rules.push({
      ruleType: LeaseRuleType.LANDLORD_RESPONSIBILITY,
      categoryScope: null,
      clauseReference: null,
      notes: null,
      priority: 0,
      terms: [],
    });
  }

  return rules;
}

function detectRuleType(line: string): LeaseRuleType | null {
  const lower = line.toLowerCase();
  if (/^#*\s*landlord/i.test(lower) || lower.startsWith('landlord')) {
    return LeaseRuleType.LANDLORD_RESPONSIBILITY;
  }
  if (/^#*\s*tenant/i.test(lower) || lower.startsWith('tenant')) {
    return LeaseRuleType.TENANT_RESPONSIBILITY;
  }
  if (/^#*\s*shared/i.test(lower) || /ambiguous/i.test(lower) || lower.startsWith('shared')) {
    return LeaseRuleType.SHARED_OR_AMBIGUOUS;
  }
  return null;
}

function splitTerms(line: string): { term: string; termType: LeaseRuleTermType }[] {
  return line
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((term) => ({
      term,
      termType: term.includes(' ') ? LeaseRuleTermType.PHRASE : LeaseRuleTermType.KEYWORD,
    }));
}
