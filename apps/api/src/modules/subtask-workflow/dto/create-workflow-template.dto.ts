import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWorkflowTemplateDto {
  @IsString()
  ticketClassId: string;

  @IsOptional()
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsString()
  supportTopicId?: string | null;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string | null;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
