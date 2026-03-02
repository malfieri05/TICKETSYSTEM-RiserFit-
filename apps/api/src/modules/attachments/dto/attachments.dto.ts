import { IsString, IsNumber, IsPositive, Max } from 'class-validator';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export class RequestUploadUrlDto {
  @IsString()
  filename: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  @Max(MAX_SIZE_BYTES, { message: 'File must be 25 MB or smaller' })
  sizeBytes: number;
}

// Sent by client after direct-to-S3 upload completes, to persist the DB record
export class ConfirmUploadDto {
  @IsString()
  s3Key: string;

  @IsString()
  filename: string;

  @IsString()
  mimeType: string;

  @IsNumber()
  @IsPositive()
  @Max(MAX_SIZE_BYTES, { message: 'File must be 25 MB or smaller' })
  sizeBytes: number;
}
