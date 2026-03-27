import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Priority, DispatchTradeType, DispatchReadiness } from '@prisma/client';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ticketClassId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  supportTopicId?: string;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string;

  @IsOptional()
  @IsString()
  studioId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(DispatchTradeType)
  dispatchTradeType?: DispatchTradeType;

  @IsOptional()
  @IsEnum(DispatchReadiness)
  dispatchReadiness?: DispatchReadiness;

  /** Key-value map of form response field keys to values. Upserts each key. */
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, string>;
}
