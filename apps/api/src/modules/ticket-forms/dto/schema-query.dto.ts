import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

/**
 * Query params for GET /ticket-forms/schema.
 * - SUPPORT: ticketClassId + departmentId + supportTopicId
 * - MAINTENANCE: ticketClassId + maintenanceCategoryId
 */
export class TicketFormSchemaQueryDto {
  @IsString()
  @IsNotEmpty()
  ticketClassId: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  supportTopicId?: string;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string;
}
