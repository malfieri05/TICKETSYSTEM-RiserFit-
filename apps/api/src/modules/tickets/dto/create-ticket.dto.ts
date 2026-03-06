import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** @deprecated Prefer ticketClassId + departmentId/supportTopicId or maintenanceCategoryId */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** Required for full taxonomy. Optional for legacy: when missing, treated as MAINTENANCE. */
  @IsOptional()
  @IsString()
  ticketClassId?: string;

  /** Required when ticketClassId is SUPPORT. */
  @IsOptional()
  @IsString()
  departmentId?: string;

  /** Required when ticketClassId is SUPPORT. */
  @IsOptional()
  @IsString()
  supportTopicId?: string;

  /** Required when ticketClassId is MAINTENANCE. */
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
  @IsString()
  ownerId?: string;
}
