import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength } from 'class-validator';

// ── Chat ─────────────────────────────────────────────────────────────────────

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}

// ── Ingest ───────────────────────────────────────────────────────────────────

export class IngestUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsUrl()
  url: string;
}

export class IngestTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
