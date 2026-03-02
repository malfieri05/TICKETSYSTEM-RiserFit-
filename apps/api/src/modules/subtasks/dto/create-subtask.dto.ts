import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreateSubtaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /**
   * If true, this subtask must be DONE before the parent ticket can be RESOLVED.
   * Defaults to true — most subtasks are required.
   */
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
