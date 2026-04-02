import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  tryCreateS3ClientFromConfig,
  type ResolvedS3,
} from '../../../common/storage/s3-client-from-config';
import {
  LeaseSourceType,
  LeaseSource,
} from '@prisma/client';

@Injectable()
export class LeaseSourceService {
  private readonly logger = new Logger(LeaseSourceService.name);
  private readonly s3: ResolvedS3 | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const { s3, endpointInvalid } = tryCreateS3ClientFromConfig(this.config);
    if (endpointInvalid) {
      this.logger.warn(
        'S3_ENDPOINT is set but is not a valid URL. Lease IQ PDFs will not be retained in object storage until fixed.',
      );
    }
    this.s3 = s3;
    if (!s3) {
      this.logger.warn(
        'S3 is not fully configured (bucket + keys). Lease IQ will still extract text from uploaded PDFs, but originals will not be stored in S3.',
      );
    }
  }

  async createFromPaste(
    studioId: string,
    pastedText: string,
    uploadedByUserId?: string,
  ): Promise<LeaseSource> {
    await this.ensureStudioExists(studioId);
    return this.prisma.leaseSource.create({
      data: {
        studioId,
        sourceType: LeaseSourceType.PASTED_EXTRACTION,
        rawText: pastedText,
        uploadedByUserId: uploadedByUserId ?? null,
      },
    });
  }

  async createFromUpload(
    studioId: string,
    file: Express.Multer.File,
    uploadedByUserId?: string,
  ): Promise<LeaseSource> {
    await this.ensureStudioExists(studioId);
    const rawText = await this.extractTextFromPdf(file.buffer);
    let fileStoragePath: string | null = null;

    if (this.s3) {
      const key = `lease-iq/${studioId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
      await this.s3.client.send(
        new PutObjectCommand({
          Bucket: this.s3.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/pdf',
        }),
      );
      fileStoragePath = key;
    }

    return this.prisma.leaseSource.create({
      data: {
        studioId,
        sourceType: LeaseSourceType.UPLOADED_PDF,
        rawText,
        fileStoragePath,
        originalFileName: file.originalname ?? null,
        uploadedByUserId: uploadedByUserId ?? null,
      },
    });
  }

  async listByStudio(studioId: string) {
    await this.ensureStudioExists(studioId);
    return this.prisma.leaseSource.findMany({
      where: { studioId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        sourceType: true,
        originalFileName: true,
        uploadedAt: true,
        uploadedByUserId: true,
      },
    });
  }

  async getLatestForStudio(studioId: string) {
    const source = await this.prisma.leaseSource.findFirst({
      where: { studioId },
      orderBy: { uploadedAt: 'desc' },
    });
    return source;
  }

  private async ensureStudioExists(studioId: string) {
    const studio = await this.prisma.studio.findUnique({
      where: { id: studioId },
    });
    if (!studio) throw new NotFoundException(`Studio ${studioId} not found`);
  }

  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data?.text ?? '';
    } catch {
      return '';
    }
  }
}
