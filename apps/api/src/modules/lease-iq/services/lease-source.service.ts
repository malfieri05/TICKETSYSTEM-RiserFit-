import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../../../common/database/prisma.service';
import {
  LeaseSourceType,
  LeaseSource,
} from '@prisma/client';

@Injectable()
export class LeaseSourceService {
  private s3: S3Client | null = null;
  private bucket: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const accessKey = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    if (accessKey && secretKey) {
      const endpoint = this.config.get<string>('S3_ENDPOINT');
      this.s3 = new S3Client({
        region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      });
      this.bucket = this.config.get<string>('S3_BUCKET') ?? null;
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

    if (this.s3 && this.bucket) {
      const key = `lease-iq/${studioId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
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
