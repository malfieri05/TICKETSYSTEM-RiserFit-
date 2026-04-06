import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service';
import { DispatchGroupStatus, DispatchTradeType, Prisma } from '@prisma/client';
import { distanceMiles } from './distance.util';

const CANDIDATE_LIMIT = 20;
const WORKSPACE_NEARBY_LIMIT = 50;

const DEFAULT_RADIUS_BY_TRADE: Record<DispatchTradeType, number> = {
  HANDYMAN: 10,
  PLUMBER: 15,
  HVAC: 20,
  ELECTRICIAN: 15,
  LOCKSMITH: 10,
  GENERAL_MAINTENANCE: 10,
};

const MAINTENANCE_CLASS_CODE = 'MAINTENANCE';

const ACTIVE_GROUP_STATUSES: DispatchGroupStatus[] = ['DRAFT', 'READY_TO_SEND'];

const CANDIDATE_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  studioId: true,
  createdAt: true,
  dispatchTradeType: true,
  dispatchReadiness: true,
  studio: {
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      formattedAddress: true,
    },
  },
} satisfies Prisma.TicketSelect;

type CandidateTicket = Prisma.TicketGetPayload<{ select: typeof CANDIDATE_SELECT }>;
type CandidateTicketWithDistance = CandidateTicket & { distanceMiles: number };

export interface RecommendationResult {
  primaryTicket: CandidateTicket;
  sameLocationCandidates: CandidateTicket[];
  nearbyLocationCandidates: CandidateTicketWithDistance[];
  summary: {
    sameLocationCount: number;
    nearbyCount: number;
    message?: string;
  };
}

@Injectable()
export class DispatchRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecommendations(
    ticketId: string,
    radiusMiles?: number,
    tradeTypeOverride?: DispatchTradeType,
  ): Promise<RecommendationResult> {
    const maintenanceClass = await this.prisma.ticketClass.findFirst({
      where: { code: MAINTENANCE_CLASS_CODE },
      select: { id: true },
    });
    if (!maintenanceClass) {
      throw new BadRequestException('Maintenance ticket class not configured');
    }

    const primary = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        ...CANDIDATE_SELECT,
        ticketClassId: true,
        maintenanceCategoryId: true,
      },
    });
    if (!primary) throw new NotFoundException(`Ticket ${ticketId} not found`);
    if (primary.ticketClassId !== maintenanceClass.id) {
      throw new BadRequestException('Dispatch recommendations are only available for maintenance tickets');
    }

    const tradeType = tradeTypeOverride ?? primary.dispatchTradeType;
    const emptyResult = (message: string): RecommendationResult => ({
      primaryTicket: primary,
      sameLocationCandidates: [],
      nearbyLocationCandidates: [],
      summary: { sameLocationCount: 0, nearbyCount: 0, message },
    });

    if (!tradeType) {
      return emptyResult('Set dispatch trade type to see recommendations.');
    }
    if (primary.dispatchReadiness !== 'READY_FOR_DISPATCH') {
      return emptyResult('Mark this ticket as Ready for Dispatch to see recommendations.');
    }
    if (primary.status === 'RESOLVED' || primary.status === 'CLOSED') {
      return emptyResult('Ticket is resolved or closed.');
    }

    const ticketIdsInActiveGroups = await this.getTicketIdsInActiveGroups();

    const sameLocationCandidates = await this.getSameLocationCandidates(
      primary,
      tradeType,
      maintenanceClass.id,
      ticketIdsInActiveGroups,
    );

    const radius = radiusMiles ?? DEFAULT_RADIUS_BY_TRADE[tradeType] ?? 10;
    const nearbyLocationCandidates = await this.getNearbyLocationCandidates(
      primary,
      tradeType,
      maintenanceClass.id,
      ticketIdsInActiveGroups,
      radius,
    );

    const messages: string[] = [];
    if (!primary.studioId) {
      messages.push('Assign a location to this ticket to see recommendations.');
    }
    if (
      primary.studio &&
      (primary.studio.latitude == null || primary.studio.longitude == null)
    ) {
      messages.push('Add coordinates to this location for nearby recommendations.');
    }

    return {
      primaryTicket: primary,
      sameLocationCandidates,
      nearbyLocationCandidates,
      summary: {
        sameLocationCount: sameLocationCandidates.length,
        nearbyCount: nearbyLocationCandidates.length,
        message: messages.length > 0 ? messages.join(' ') : undefined,
      },
    };
  }

  private async getTicketIdsInActiveGroups(): Promise<Set<string>> {
    const items = await this.prisma.dispatchGroupItem.findMany({
      where: {
        group: { status: { in: ACTIVE_GROUP_STATUSES } },
      },
      select: { ticketId: true },
    });
    return new Set(items.map((i) => i.ticketId));
  }

  private async getSameLocationCandidates(
    primary: CandidateTicket,
    tradeType: DispatchTradeType,
    maintenanceClassId: string,
    excludeTicketIds: Set<string>,
  ) {
    if (!primary.studioId) return [];

    const candidates = await this.prisma.ticket.findMany({
      where: {
        studioId: primary.studioId,
        id: { not: primary.id },
        dispatchTradeType: tradeType,
        dispatchReadiness: 'READY_FOR_DISPATCH',
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        ticketClassId: maintenanceClassId,
      },
      select: CANDIDATE_SELECT,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      take: CANDIDATE_LIMIT * 2, // fetch extra to filter out active-group tickets
    });

    return candidates
      .filter((c) => !excludeTicketIds.has(c.id))
      .slice(0, CANDIDATE_LIMIT);
  }

  private async getNearbyLocationCandidates(
    primary: CandidateTicket,
    tradeType: DispatchTradeType,
    maintenanceClassId: string,
    excludeTicketIds: Set<string>,
    radiusMiles: number,
  ) {
    if (!primary.studioId) return [];
    const primaryStudio = primary.studio;
    if (
      !primaryStudio ||
      primaryStudio.latitude == null ||
      primaryStudio.longitude == null
    ) {
      return [];
    }

    const candidates = await this.prisma.ticket.findMany({
      where: {
        studioId: { not: primary.studioId },
        id: { not: primary.id },
        dispatchTradeType: tradeType,
        dispatchReadiness: 'READY_FOR_DISPATCH',
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        ticketClassId: maintenanceClassId,
        studio: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      select: CANDIDATE_SELECT,
    });

    const filtered = candidates
      .filter((c) => !excludeTicketIds.has(c.id))
      .map((c) => {
        const dist = distanceMiles(
          primaryStudio.latitude!,
          primaryStudio.longitude!,
          c.studio!.latitude!,
          c.studio!.longitude!,
        );
        return { ...c, distanceMiles: Math.round(dist * 10) / 10 };
      })
      .filter((c) => c.distanceMiles <= radiusMiles);

    // Sort by distance ASC, then createdAt DESC
    filtered.sort((a, b) => {
      if (a.distanceMiles !== b.distanceMiles)
        return a.distanceMiles - b.distanceMiles;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return filtered.slice(0, CANDIDATE_LIMIT);
  }

  /**
   * Workspace nearby: broader than group-creation eligibility.
   * Anchor may be any open maintenance ticket (READY_FOR_DISPATCH not required).
   * Nearby candidates: same dispatchTradeType, status not RESOLVED/CLOSED, within radius,
   * exclude anchor, valid studio coordinates. No READY_FOR_DISPATCH or maintenanceCategoryId requirement.
   */
  async getNearbyForWorkspace(
    anchorTicketId: string,
    radiusMiles: number,
  ): Promise<{
    anchor: CandidateTicket | null;
    nearby: CandidateTicketWithDistance[];
    message?: string;
  }> {
    const maintenanceClass = await this.prisma.ticketClass.findFirst({
      where: { code: MAINTENANCE_CLASS_CODE },
      select: { id: true },
    });
    if (!maintenanceClass) {
      return { anchor: null, nearby: [], message: 'Maintenance ticket class not configured.' };
    }

    const anchor = await this.prisma.ticket.findUnique({
      where: { id: anchorTicketId },
      select: {
        ...CANDIDATE_SELECT,
        ticketClassId: true,
        maintenanceCategoryId: true,
        maintenanceCategory: { select: { id: true, name: true } },
      },
    });

    if (!anchor) {
      throw new NotFoundException(`Ticket ${anchorTicketId} not found`);
    }
    if (anchor.ticketClassId !== maintenanceClass.id) {
      return { anchor: null, nearby: [], message: 'Anchor must be a maintenance ticket.' };
    }
    if (anchor.status === 'RESOLVED' || anchor.status === 'CLOSED') {
      return { anchor: null, nearby: [], message: 'Anchor ticket is resolved or closed.' };
    }
    if (!anchor.studioId || !anchor.studio) {
      return { anchor, nearby: [], message: 'Anchor ticket has no location; add a location to see nearby tickets.' };
    }
    if (anchor.studio.latitude == null || anchor.studio.longitude == null) {
      return { anchor, nearby: [], message: 'Anchor ticket has no coordinates; add coordinates to see nearby tickets.' };
    }
    if (!anchor.dispatchTradeType) {
      return { anchor, nearby: [], message: 'Anchor ticket has no dispatch trade type; set trade type to see nearby tickets.' };
    }

    const candidates = await this.prisma.ticket.findMany({
      where: {
        id: { not: anchorTicketId },
        ticketClassId: maintenanceClass.id,
        dispatchTradeType: anchor.dispatchTradeType,
        status: { notIn: ['RESOLVED', 'CLOSED'] },
        studioId: { not: null },
        studio: {
          latitude: { not: null },
          longitude: { not: null },
        },
      },
      select: {
        ...CANDIDATE_SELECT,
        maintenanceCategoryId: true,
        maintenanceCategory: { select: { id: true, name: true } },
      },
    });

    const anchorLat = anchor.studio.latitude!;
    const anchorLng = anchor.studio.longitude!;

    const withDistance = candidates
      .filter((c): c is typeof c & { studio: NonNullable<typeof c.studio> } => c.studio != null && c.studio.latitude != null && c.studio.longitude != null)
      .map((c) => {
        const dist = distanceMiles(anchorLat, anchorLng, c.studio.latitude!, c.studio.longitude!);
        return { ...c, distanceMiles: Math.round(dist * 10) / 10 };
      })
      .filter((c) => c.distanceMiles <= radiusMiles);

    withDistance.sort((a, b) => {
      if (a.distanceMiles !== b.distanceMiles) return a.distanceMiles - b.distanceMiles;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const nearby = withDistance.slice(0, WORKSPACE_NEARBY_LIMIT);

    return { anchor, nearby };
  }
}
