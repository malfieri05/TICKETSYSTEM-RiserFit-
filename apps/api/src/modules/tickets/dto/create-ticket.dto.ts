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

  @IsOptional()
  @IsString()
  categoryId?: string;

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
