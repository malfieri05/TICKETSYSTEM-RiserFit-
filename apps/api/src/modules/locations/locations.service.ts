import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
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
  constructor(private prisma: PrismaService) {}

  async getProfile(studioId: string, user: RequestUser): Promise<LocationProfileResponseDto> {
    const toDateOnly = (d: Date | null | undefined): string | null => {
      if (!d) return null;
      // DateTime stored in UTC; normalize to date-only string to avoid timezone drift.
      return d.toISOString().slice(0, 10);
    };

    const studio = await this.prisma.studio.findUnique({
      where: { id: studioId },
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
      throw new NotFoundException(`Studio ${studioId} not found`);
    }

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
    };
  }
}
