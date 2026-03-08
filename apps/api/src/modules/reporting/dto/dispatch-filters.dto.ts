import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Priority } from '@prisma/client';

export class DispatchFiltersDto {
  @IsOptional()
  @IsString()
  studioId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string;

  @IsOptional()
  @IsString()
  createdAfter?: string;

  @IsOptional()
  @IsString()
  createdBefore?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
