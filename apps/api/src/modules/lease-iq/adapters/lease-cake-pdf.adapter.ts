import { parsePastedExtraction } from './pasted-extraction.adapter';
import { ParsedRuleDto } from '../dto/lease-iq.dto';

/**
 * LeaseCake PDF adapter: extracted text from PDF is treated like pasted extraction.
 * PDF extraction happens in LeaseSourceService (pdf-parse); this adapter parses
 * the resulting raw text into rules/terms using the same logic as pasted text.
 */
export function parseLeaseCakeExtraction(rawText: string): ParsedRuleDto[] {
  return parsePastedExtraction(rawText);
}
