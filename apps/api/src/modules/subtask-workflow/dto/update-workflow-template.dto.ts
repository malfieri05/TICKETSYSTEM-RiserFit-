import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
