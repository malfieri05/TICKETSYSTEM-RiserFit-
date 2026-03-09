import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsObject,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateTicketDto {
  /** Optional when taxonomy + formResponses present (backend will auto-generate). Required for fallback/create without schema. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

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

  /** Stage 3: dynamic form responses (fieldKey → value). Validated against schema when ticketClassId + topic are set. */
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, string>;
}
