import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { SubtaskStatus } from '@prisma/client';

export class UpdateSubtaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsEnum(SubtaskStatus)
  status?: SubtaskStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
