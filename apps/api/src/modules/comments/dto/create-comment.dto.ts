import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  body: string;

  /**
   * Internal notes are only visible to agents/managers/admins.
   * Requesters cannot post internal notes and cannot see them.
   */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
