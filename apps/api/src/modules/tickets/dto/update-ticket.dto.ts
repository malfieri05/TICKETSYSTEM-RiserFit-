import { IsString, IsOptional, IsEnum, MaxLength, MinLength } from 'class-validator';
import { Priority } from '@prisma/client';

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
}
