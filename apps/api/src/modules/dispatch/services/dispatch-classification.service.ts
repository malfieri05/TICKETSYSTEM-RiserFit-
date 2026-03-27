import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { DispatchTradeType } from '@prisma/client';

/**
 * Mapping from maintenance category name → default DispatchTradeType.
 * Uses category name for stability (avoids binding to CUIDs).
 */
const CATEGORY_TO_TRADE_TYPE: Record<string, DispatchTradeType> = {
  'Plumbing': DispatchTradeType.PLUMBER,
  'HVAC': DispatchTradeType.HVAC,
  'Electrical / Lighting': DispatchTradeType.ELECTRICIAN,
  'Doors / Locks / Hardware': DispatchTradeType.LOCKSMITH,
  'Flooring': DispatchTradeType.GENERAL_MAINTENANCE,
  'Mirror / Glass': DispatchTradeType.HANDYMAN,
  'Walls / Paint / Mounted Items': DispatchTradeType.HANDYMAN,
  'Roof / Water Intrusion': DispatchTradeType.GENERAL_MAINTENANCE,
  'Pest Control': DispatchTradeType.GENERAL_MAINTENANCE,
  'Equipment / Fixtures': DispatchTradeType.HANDYMAN,
  'Other': DispatchTradeType.GENERAL_MAINTENANCE,
};

@Injectable()
export class DispatchClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Given a maintenanceCategoryId, return a suggested default DispatchTradeType.
   * Returns null if no mapping exists or category not found.
   */
  async getSuggestedTradeType(
    maintenanceCategoryId: string | null | undefined,
  ): Promise<DispatchTradeType | null> {
    if (!maintenanceCategoryId) return null;

    const category = await this.prisma.maintenanceCategory.findUnique({
      where: { id: maintenanceCategoryId },
      select: { name: true },
    });
    if (!category) return null;

    return CATEGORY_TO_TRADE_TYPE[category.name] ?? null;
  }

  /**
   * Synchronous lookup by category name (when name is already loaded).
   */
  getTradeTypeForCategoryName(
    categoryName: string,
  ): DispatchTradeType | null {
    return CATEGORY_TO_TRADE_TYPE[categoryName] ?? null;
  }
}
