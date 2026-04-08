import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  MaxLength,
} from 'class-validator';

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

// ── Riser policy sync (optional body overrides env) ─────────────────────────

export class RiserSyncDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  apiKey?: string;

  /** Comma-separated Riser policy IDs (same as RISER_POLICY_IDS env). */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  policyIds?: string;
}
