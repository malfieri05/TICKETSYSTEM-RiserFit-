import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaseRuleSetStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { PolicyService } from '../../policy/policy.service';
import { TICKET_VIEW } from '../../policy/capabilities/capability-keys';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import type {
  LocationProfileResponseDto,
  StudioIdentityDto,
  OperationalPublicDto,
  OwnershipTeamRestrictedDto,
  ContactInfoRestrictedDto,
  InternalIdentifiersRestrictedDto,
} from './dto/location-profile.dto';

const PRIVILEGED_ROLES = ['ADMIN', 'DEPARTMENT_USER'];

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private policy: PolicyService,
  ) {}

  async getProfile(studioId: string, user: RequestUser): Promise<LocationProfileResponseDto> {
    return this.loadProfile(studioId, user, true);
  }

  /**
   * Loads a studio location profile. When `tryTicketIdAlias` is true, if `routeId` is not a studio
   * but is a ticket id the user may view, resolves that ticket's studio (avoids dead links from
   * mistaken /locations/:cuid where cuid was a ticket id).
   */
  private async loadProfile(
    routeId: string,
    user: RequestUser,
    tryTicketIdAlias: boolean,
  ): Promise<LocationProfileResponseDto> {
    const toDateOnly = (d: Date | null | undefined): string | null => {
      if (!d) return null;
      // DateTime stored in UTC; normalize to date-only string to avoid timezone drift.
      return d.toISOString().slice(0, 10);
    };

    const studio = await this.prisma.studio.findUnique({
      where: { id: routeId },
      select: {
        id: true,
        name: true,
        formattedAddress: true,
        latitude: true,
        longitude: true,
        externalCode: true,
        isActive: true,
        market: { select: { id: true, name: true } },
        profile: true,
      },
    });

    if (!studio) {
      if (tryTicketIdAlias) {
        const ticket = await this.prisma.ticket.findUnique({
          where: { id: routeId },
          select: {
            id: true,
            requesterId: true,
            ownerId: true,
            studioId: true,
            department: { select: { code: true } },
            owner: {
              select: {
                teamId: true,
                team: { select: { name: true } },
              },
            },
          },
        });
        if (ticket?.studioId) {
          const decision = this.policy.evaluate(TICKET_VIEW, user, ticket);
          if (decision.allowed) {
            return this.loadProfile(ticket.studioId, user, false);
          }
        }
      }
      throw new NotFoundException(`Studio ${routeId} not found`);
    }

    const publishedLeaseIq = await this.prisma.leaseRuleSet.findFirst({
      where: { studioId: studio.id, status: LeaseRuleSetStatus.PUBLISHED },
      select: { id: true },
    });
    const hasPublishedLeaseIqRuleset = !!publishedLeaseIq;

    const isPrivileged = PRIVILEGED_ROLES.includes(user.role);
    const hasProfile = !!studio.profile;

    const studioIdentity: StudioIdentityDto = {
      id: studio.id,
      name: studio.name,
      formattedAddress: studio.formattedAddress,
      latitude: studio.latitude,
      longitude: studio.longitude,
      externalCode: studio.externalCode,
      isActive: studio.isActive,
      market: studio.market,
    };

    const profile = studio.profile;

    const publicOperational: OperationalPublicDto = {
      district: profile?.district ?? null,
      status: profile?.status ?? null,
      maturity: profile?.maturity ?? null,
      studioSize: profile?.studioSize ?? null,
      priceTier: profile?.priceTier ?? null,
      openType: profile?.openType ?? null,
      studioOpenDate: toDateOnly(profile?.studioOpenDate),
      rfSoftOpenDate: toDateOnly(profile?.rfSoftOpenDate),
    };

    const restricted: {
      ownership: OwnershipTeamRestrictedDto;
      contact: ContactInfoRestrictedDto;
      identifiers: InternalIdentifiersRestrictedDto;
    } | null =
      isPrivileged && hasProfile
        ? {
            ownership: {
              dm: profile?.dm ?? null,
              gm: profile?.gm ?? null,
              agm: profile?.agm ?? null,
              edc: profile?.edc ?? null,
              li: profile?.li ?? null,
            },
            contact: {
              studioEmail: profile?.studioEmail ?? null,
              gmEmail: profile?.gmEmail ?? null,
              gmTeams: profile?.gmTeams ?? null,
              liEmail: profile?.liEmail ?? null,
            },
            identifiers: {
              studioCode: profile?.studioCode ?? null,
              netsuiteName: profile?.netsuiteName ?? null,
              ikismetName: profile?.ikismetName ?? null,
              crName: profile?.crName ?? null,
              crId: profile?.crId ?? null,
              paycomCode: profile?.paycomCode ?? null,
            },
          }
        : null;

    return {
      studio: studioIdentity,
      profile: {
        metadataAvailability: hasProfile ? 'full' : 'missing',
        public: publicOperational,
        restricted,
      },
      visibility: {
        showOwnership: isPrivileged && hasProfile,
        showContact: isPrivileged && hasProfile,
        showIdentifiers: isPrivileged && hasProfile,
      },
      hasPublishedLeaseIqRuleset,
    };
  }
}
