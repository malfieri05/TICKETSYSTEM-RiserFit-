import { IsString, IsOptional } from 'class-validator';

/**
 * Raw email text (subject + body). Optional subject line; if not present, full text is treated as body.
 */
export class EmailPatternPlaygroundDto {
  /** Raw email content. If it starts with "Subject:", first line is subject and the rest is body; otherwise all is body. */
  @IsString()
  rawEmail: string;

  /** Optional explicit subject (overrides parsing from rawEmail). */
  @IsOptional()
  @IsString()
  subject?: string;

  /** Optional explicit body (overrides rawEmail when both subject and body provided). */
  @IsOptional()
  @IsString()
  body?: string;
}
