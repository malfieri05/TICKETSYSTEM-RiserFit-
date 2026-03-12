import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsString()
  parentCommentId?: string;

  /** Internal notes feature removed; ignored if sent. Kept for API compatibility. */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
