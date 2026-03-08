import { IsString, IsOptional, IsBoolean, MinLength, IsNumber, Min, Max, ValidateIf } from 'class-validator';

// ─── Categories ────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

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
}
