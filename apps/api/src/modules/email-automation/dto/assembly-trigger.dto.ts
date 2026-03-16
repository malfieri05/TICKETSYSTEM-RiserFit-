import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AssemblyTriggerMatchMode } from '@prisma/client';

export class CreateAssemblyTriggerItemDto {
  @IsString()
  keywordOrPhrase: string;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  matchMode?: AssemblyTriggerMatchMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAssemblyTriggerItemDto {
  @IsOptional()
  @IsString()
  keywordOrPhrase?: string;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  matchMode?: AssemblyTriggerMatchMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
