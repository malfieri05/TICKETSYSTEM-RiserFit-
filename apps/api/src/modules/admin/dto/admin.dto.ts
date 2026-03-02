import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

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
}

export class UpdateStudioDto {
  @IsOptional()
  @IsString()
  name?: string;
}
