import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../../common/database/prisma.service';
import { RequestUploadUrlDto } from './dto/attachments.dto';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const UPLOAD_URL_TTL = 300; // 5 minutes — presigned upload URL lifetime
const DOWNLOAD_URL_TTL = 900; // 15 minutes — presigned download URL lifetime

@Injectable()
export class AttachmentsService {
  private s3: S3Client;
  private bucket: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');

    this.s3 = new S3Client({
      region: this.config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      // Optional: Cloudflare R2 / MinIO endpoint override
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
  }

  // ── Step 1: Client requests a presigned upload URL ────────────────────────
  async requestUploadUrl(
    ticketId: string,
    dto: RequestUploadUrlDto,
    uploadedById: string,
  ) {
    if (dto.sizeBytes > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds 25 MB limit');
    }

    // Verify ticket exists
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    // Build a unique S3 key: tickets/<ticketId>/<timestamp>-<filename>
    const safeFilename = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const s3Key = `tickets/${ticketId}/${Date.now()}-${safeFilename}`;

    // Generate presigned PUT URL — client uploads directly to S3
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: dto.mimeType,
      ContentLength: dto.sizeBytes,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: UPLOAD_URL_TTL,
    });

    return {
      uploadUrl,
      s3Key,
      expiresIn: UPLOAD_URL_TTL,
    };
  }

  // ── Step 2: Client confirms upload complete → we save the record ─────────
  async confirmUpload(
    ticketId: string,
    s3Key: string,
    dto: RequestUploadUrlDto,
    uploadedById: string,
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        ticketId,
        uploadedById,
        filename: dto.filename,
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        s3Key,
        s3Bucket: this.bucket,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    return attachment;
  }

  // ── List attachments for a ticket ─────────────────────────────────────────
  async listAttachments(ticketId: string) {
    return this.prisma.ticketAttachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  // ── Get a presigned download URL for a specific attachment ────────────────
  async getDownloadUrl(attachmentId: string) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment)
      throw new NotFoundException(`Attachment ${attachmentId} not found`);

    const command = new GetObjectCommand({
      Bucket: attachment.s3Bucket,
      Key: attachment.s3Key,
      ResponseContentDisposition: `attachment; filename="${attachment.filename}"`,
    });

    const downloadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: DOWNLOAD_URL_TTL,
    });

    return {
      downloadUrl,
      filename: attachment.filename,
      expiresIn: DOWNLOAD_URL_TTL,
    };
  }

  /** Upload a buffer to S3 (server-side). Used e.g. for knowledge base PDFs. */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  /** Get object body from S3 as Buffer. Used e.g. by ingestion worker to fetch PDF. */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const chunks: Uint8Array[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }
    return Buffer.concat(chunks);
  }

  /** Delete an object by key (e.g. when deleting a knowledge document). */
  async deleteObjectByKey(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  // ── Delete an attachment ──────────────────────────────────────────────────
  async deleteAttachment(attachmentId: string, requesterId: string) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment)
      throw new NotFoundException(`Attachment ${attachmentId} not found`);

    // Delete from S3
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: attachment.s3Bucket,
        Key: attachment.s3Key,
      }),
    );

    // Delete DB record
    await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });

    return { deleted: true };
  }
}
