import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

/** Strip quotes / paste junk so R2 endpoint survives bad .env lines (e.g. `- https://...`). */
export function normalizeS3Endpoint(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let e = String(raw).trim();
  if (!e) return undefined;
  e = e.replace(/^["']|["']$/g, '');
  e = e.replace(/^\s*[=:-]+\s*/, '');
  e = e.replace(/^\s*-\s+/, '');
  if (!/^https?:\/\//i.test(e)) {
    e = `https://${e}`;
  }
  try {
    const url = new URL(e);
    if (!url.hostname) return undefined;
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

export function isCloudflareR2Endpoint(endpoint: string): boolean {
  try {
    return /\.r2\.cloudflarestorage\.com$/i.test(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}

export type ResolvedS3 = { client: S3Client; bucket: string };

/**
 * Same env contract as ticket attachments: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
 * S3_BUCKET, optional S3_REGION / S3_ENDPOINT (R2, MinIO, etc.).
 */
export function tryCreateS3ClientFromConfig(config: ConfigService): {
  s3: ResolvedS3 | null;
  endpointInvalid: boolean;
} {
  const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID')?.trim();
  const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY')?.trim();
  const bucket = config.get<string>('S3_BUCKET')?.trim();
  const rawEndpoint = config.get<string>('S3_ENDPOINT')?.trim();
  const endpoint = normalizeS3Endpoint(rawEndpoint);
  const endpointInvalid = Boolean(rawEndpoint && !endpoint);

  const rawRegion = config.get<string>('S3_REGION')?.trim();
  const region =
    rawRegion && rawRegion.length > 0 ? rawRegion : endpoint ? 'auto' : 'us-east-1';

  if (!accessKeyId || !secretAccessKey || !bucket) {
    return { s3: null, endpointInvalid };
  }

  const isR2 = endpoint ? isCloudflareR2Endpoint(endpoint) : false;
  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(endpoint
      ? {
          endpoint,
          ...(isR2 ? {} : { forcePathStyle: true as const }),
        }
      : {}),
  });

  return { s3: { client, bucket }, endpointInvalid };
}
