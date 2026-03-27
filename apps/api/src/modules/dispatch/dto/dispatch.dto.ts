import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
  IsDateString,
  ArrayMinSize,
  ValidateNested,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DispatchTradeType, DispatchGroupStatus } from '@prisma/client';

export class CreateDispatchGroupDto {
  @IsEnum(DispatchTradeType)
  tradeType: DispatchTradeType;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  ticketIds: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class UpdateDispatchGroupDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsEnum(DispatchGroupStatus)
  status?: DispatchGroupStatus;
}

export class AddDispatchGroupItemDto {
  @IsString()
  ticketId: string;
}

export class ReorderItemDto {
  @IsString()
  itemId: string;

  @IsNumber()
  @Min(0)
  stopOrder: number;
}

export class ReorderDispatchGroupItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  order: ReorderItemDto[];
}

export class DispatchGroupFiltersDto {
  @IsOptional()
  @IsEnum(DispatchGroupStatus)
  status?: DispatchGroupStatus;

  @IsOptional()
  @IsEnum(DispatchTradeType)
  tradeType?: DispatchTradeType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

export class DispatchReadyFiltersDto {
  @IsOptional()
  @IsEnum(DispatchTradeType)
  tradeType?: DispatchTradeType;

  @IsOptional()
  @IsString()
  studioId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

export class RecommendationQueryDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  radiusMiles?: number;

  @IsOptional()
  @IsEnum(DispatchTradeType)
  tradeType?: DispatchTradeType;
}

export class WorkspaceNearbyQueryDto {
  @IsString()
  anchorTicketId: string;

  @IsNumber()
  @Min(0.1)
  @Type(() => Number)
  radiusMiles: number;
}

export class CreateDispatchTemplateDto {
  @IsString()
  name: string;

  @IsEnum(DispatchTradeType)
  dispatchTradeType: DispatchTradeType;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string;

  @IsOptional()
  @IsString()
  anchorStudioId?: string;

  @IsNumber()
  @Min(0.1)
  @Type(() => Number)
  radiusMiles: number;
}

export class UpdateDispatchTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DispatchTradeType)
  dispatchTradeType?: DispatchTradeType;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  maintenanceCategoryId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  anchorStudioId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Type(() => Number)
  radiusMiles?: number;
}
