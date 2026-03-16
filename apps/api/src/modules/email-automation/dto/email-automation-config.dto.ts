import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

/**
 * DTO for email automation config (Gmail + assembly + confidence thresholds).
 * Used for GET and PATCH of the singleton config row.
 */
export class EmailAutomationConfigDto {
  @IsOptional()
  @IsString()
  gmailLabel?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  gmailPollWindowHours?: number;

  @IsOptional()
  @IsString()
  assemblyCategoryId?: string | null;

  @IsOptional()
  @IsString()
  systemRequesterId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minOrderNumberConfidence?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minAddressConfidence?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minItemConfidence?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export interface EmailAutomationConfigRow {
  id: string;
  gmailLabel: string | null;
  gmailPollWindowHours: number;
  gmailRefreshToken: string | null;
  gmailConnectedEmail: string | null;
  assemblyCategoryId: string | null;
  systemRequesterId: string | null;
  minOrderNumberConfidence: number;
  minAddressConfidence: number;
  minItemConfidence: number;
  isEnabled: boolean;
  updatedAt: Date;
  createdAt: Date;
}
