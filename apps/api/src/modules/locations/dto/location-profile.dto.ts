export interface StudioIdentityDto {
  id: string;
  name: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  externalCode: string | null;
  isActive: boolean;
  market: {
    id: string;
    name: string;
  };
}

export type LocationMetadataAvailability = 'full' | 'missing';

export interface OperationalPublicDto {
  district: string | null;
  status: string | null;
  maturity: string | null;
  studioSize: number | null;
  priceTier: number | null;
  openType: string | null;
  studioOpenDate: string | null; // YYYY-MM-DD
  rfSoftOpenDate: string | null; // YYYY-MM-DD
}

export interface OwnershipTeamRestrictedDto {
  dm: string | null;
  gm: string | null;
  agm: string | null;
  edc: string | null;
  li: string | null;
}

export interface ContactInfoRestrictedDto {
  studioEmail: string | null;
  gmEmail: string | null;
  gmTeams: string | null;
  liEmail: string | null;
}

export interface InternalIdentifiersRestrictedDto {
  studioCode: string | null;
  netsuiteName: string | null;
  ikismetName: string | null;
  crName: string | null;
  crId: string | null;
  paycomCode: string | null;
}

export interface LocationProfileResponseDto {
  studio: StudioIdentityDto;
  profile: {
    metadataAvailability: LocationMetadataAvailability;
    public: OperationalPublicDto;
    restricted: {
      ownership: OwnershipTeamRestrictedDto;
      contact: ContactInfoRestrictedDto;
      identifiers: InternalIdentifiersRestrictedDto;
    } | null;
  };
  visibility: {
    showOwnership: boolean;
    showContact: boolean;
    showIdentifiers: boolean;
  };
}
