import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { normalizeAddressRaw } from '../adapters/base.parser';

export type AddressMatchResult =
  | { kind: 'single'; studioId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous'; studioIds: string[] };

/**
 * Normalizes an address and matches it against studio_address_normalized.
 * Single clear match → use; zero or multiple → none/ambiguous.
 */
@Injectable()
export class AddressMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalize for matching: same as base parser (lowercase, Street→St, collapse space).
   */
  normalize(address: string | null): string | null {
    return normalizeAddressRaw(address);
  }

  /**
   * Match normalized address to exactly one studio. If zero or multiple matches, return none/ambiguous.
   */
  async matchToStudio(normalizedAddress: string | null): Promise<AddressMatchResult> {
    if (!normalizedAddress || !normalizedAddress.trim()) {
      return { kind: 'none' };
    }

    const candidates = await this.prisma.studioAddressNormalized.findMany({
      where: {
        normalizedAddress: {
          equals: normalizedAddress,
          mode: 'insensitive',
        },
      },
      select: { studioId: true },
    });

    const uniqueStudioIds = [...new Set(candidates.map((c) => c.studioId))];
    if (uniqueStudioIds.length === 0) return { kind: 'none' };
    if (uniqueStudioIds.length === 1) return { kind: 'single', studioId: uniqueStudioIds[0] };
    return { kind: 'ambiguous', studioIds: uniqueStudioIds };
  }

  /**
   * Build/refresh studio_address_normalized from Studio.formattedAddress.
   * Replaces all rows for studios that have formattedAddress.
   */
  async refreshNormalizedAddresses(): Promise<{ updated: number }> {
    const studios = await this.prisma.studio.findMany({
      where: { formattedAddress: { not: null } },
      select: { id: true, formattedAddress: true },
    });

    let updated = 0;
    for (const studio of studios) {
      const raw = studio.formattedAddress!;
      const normalized = this.normalize(raw) || raw.toLowerCase().replace(/\s+/g, ' ').trim();

      await this.prisma.studioAddressNormalized.deleteMany({
        where: { studioId: studio.id },
      });
      await this.prisma.studioAddressNormalized.create({
        data: {
          studioId: studio.id,
          normalizedAddress: normalized,
        },
      });
      updated++;
    }
    return { updated };
  }
}
