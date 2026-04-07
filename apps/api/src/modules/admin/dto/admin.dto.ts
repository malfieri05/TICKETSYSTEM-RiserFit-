import {
  IsString,
  IsOptional,
  MinLength,
  IsNumber,
  IsInt,
  Min,
  Max,
  ValidateIf,
  IsBoolean,
  Matches,
} from 'class-validator';

// ─── Markets ───────────────────────────────────────────────────────────────

export class CreateMarketDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class UpdateMarketDto {
  @IsOptional()
  @IsString()
  name?: string;
}

// ─── Studios ───────────────────────────────────────────────────────────────

export class CreateStudioDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  marketId: string;

  @IsString()
  @MinLength(1)
  formattedAddress: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class UpdateStudioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  formattedAddress?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  /** Unique external reference; omit to leave unchanged, null or empty clears. */
  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsString()
  externalCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Partial patch for studio_profiles; omitted keys are left unchanged. */
export class UpsertStudioProfileDto {
  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  maturity?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsInt()
  @Min(0)
  studioSize?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsInt()
  @Min(0)
  priceTier?: number | null;

  @IsOptional()
  @IsString()
  openType?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  studioOpenDate?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v != null && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  rfSoftOpenDate?: string | null;

  @IsOptional()
  @IsString()
  dm?: string;

  @IsOptional()
  @IsString()
  gm?: string;

  @IsOptional()
  @IsString()
  agm?: string;

  @IsOptional()
  @IsString()
  edc?: string;

  @IsOptional()
  @IsString()
  li?: string;

  @IsOptional()
  @IsString()
  studioEmail?: string;

  @IsOptional()
  @IsString()
  gmEmail?: string;

  @IsOptional()
  @IsString()
  gmTeams?: string;

  @IsOptional()
  @IsString()
  liEmail?: string;

  @IsOptional()
  @IsString()
  studioCode?: string;

  @IsOptional()
  @IsString()
  netsuiteName?: string;

  @IsOptional()
  @IsString()
  ikismetName?: string;

  @IsOptional()
  @IsString()
  crName?: string;

  @IsOptional()
  @IsString()
  crId?: string;

  @IsOptional()
  @IsString()
  paycomCode?: string;
}
