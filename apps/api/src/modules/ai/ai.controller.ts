import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Patch,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { IngestionService } from './ingestion.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { RiserPolicySyncService } from './riser-policy-sync.service';
import { ChatDto, IngestTextDto } from './dto/ai.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

// 10MB max for plain-text / markdown document uploads
const MAX_DOC_SIZE = 10 * 1024 * 1024;
// 15MB max for PDF handbook uploads
const MAX_PDF_SIZE = 15 * 1024 * 1024;

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly ingestionService: IngestionService,
    private readonly attachmentsService: AttachmentsService,
    private readonly riserSync: RiserPolicySyncService,
  ) {}

  // ── Chat (all authenticated users) ───────────────────────────────────────

  /**
   * POST /api/ai/chat
   * Ask the AI assistant a question. Returns an answer + source citations.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatDto) {
    return this.aiService.chat(dto.message);
  }

  /**
   * POST /api/ai/handbook-chat
   * Studio users only. RAG over handbook documents only.
   */
  @Post('handbook-chat')
  @HttpCode(HttpStatus.OK)
  async handbookChat(@Body() dto: ChatDto, @CurrentUser() user: RequestUser) {
    if (user.studioId == null) {
      throw new ForbiddenException(
        'Handbook chat is only available to studio users.',
      );
    }
    return this.aiService.chatHandbook(dto.message);
  }

  // ── Knowledge base management (ADMIN only) ─────────────────────────────

  /**
   * GET /api/ai/documents
   * List all knowledge base documents.
   */
  @Get('documents')
  @Roles(Role.ADMIN)
  async listDocuments() {
    try {
      return await this.aiService.listDocuments();
    } catch (err) {
      this.logger.error(
        'GET /api/ai/documents failed — listDocuments',
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  /**
   * POST /api/ai/riser/sync
   * Admin-only. Sync policies from Riser API into the knowledge base.
   */
  @Post('riser/sync')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async syncRiserPolicies(@CurrentUser() user: RequestUser) {
    try {
      const result = await this.riserSync.syncAllPolicies(user.id);
      return result;
    } catch (err) {
      this.logger.error(
        `Riser sync failed unexpectedly for admin ${user.id}`,
        err as Error,
      );
      // Preserve real server failures as 500 while avoiding 400s for config issues.
      throw err;
    }
  }

  /**
   * POST /api/ai/ingest/text
   * Ingest a plain-text / markdown document by pasting content directly.
   */
  @Post('ingest/text')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async ingestText(
    @Body() dto: IngestTextDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.logger.log(`Admin ${user.id} ingesting text doc: "${dto.title}"`);
    return this.ingestionService.ingestText(dto.title, dto.content, user.id, {
      sourceType: 'manual',
    });
  }

  /**
   * POST /api/ai/ingest/file
   * Upload a .txt or .md file for ingestion (multipart/form-data).
   * Field name: "file", additional body field: "title"
   */
  @Post('ingest/file')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOC_SIZE },
      fileFilter: (_req, file, cb) => {
        const allowed = ['text/plain', 'text/markdown', 'text/x-markdown'];
        if (
          allowed.includes(file.mimetype) ||
          file.originalname.match(/\.(txt|md)$/i)
        ) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only .txt and .md files are supported for ingestion',
            ),
            false,
          );
        }
      },
    }),
  )
  async ingestFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!title?.trim()) throw new BadRequestException('title is required');

    const content = file.buffer.toString('utf-8');
    this.logger.log(
      `Admin ${user.id} ingesting file: "${file.originalname}" (${file.size} bytes)`,
    );

    return this.ingestionService.ingestText(title.trim(), content, user.id, {
      sourceType: 'file',
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  /**
   * POST /api/ai/ingest/pdf
   * Upload a PDF for handbook ingestion. Stores in S3, creates document record, enqueues ingestion job.
   */
  @Post('ingest/pdf')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PDF_SIZE },
      fileFilter: (_req, file, cb) => {
        if (
          file.mimetype === 'application/pdf' ||
          file.originalname?.match(/\.pdf$/i)
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are supported'), false);
        }
      },
    }),
  )
  async ingestPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!title?.trim()) throw new BadRequestException('title is required');

    const doc = await this.aiService.createHandbookDocument(
      title.trim(),
      user.id,
      {
        mimeType: 'application/pdf',
        sizeBytes: file.size,
      },
    );
    const s3Key = `knowledge/${doc.id}.pdf`;
    await this.attachmentsService.uploadBuffer(
      s3Key,
      file.buffer,
      'application/pdf',
    );
    await this.aiService.updateDocumentS3Key(doc.id, s3Key);
    await this.ingestionService.enqueueIngestionJob(doc.id);
    this.logger.log(
      `Admin ${user.id} uploaded PDF: "${file.originalname}" → documentId=${doc.id}, job enqueued`,
    );
    return {
      documentId: doc.id,
      status: 'pending',
      message: 'Document uploaded. Indexing in progress.',
    };
  }

  /**
   * POST /api/ai/knowledge/:id/reindex
   * Re-run ingestion for a document (fetch from S3, re-extract, re-chunk, re-embed).
   */
  @Post('knowledge/:id/reindex')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async reindexKnowledgeDocument(@Param('id') id: string) {
    await this.aiService.reindexDocument(id);
    return { message: 'Re-indexing started.' };
  }

  /**
   * PATCH /api/ai/documents/:id/toggle
   * Enable or disable a knowledge document (soft-delete from retrieval).
   */
  @Patch('documents/:id/toggle')
  @Roles(Role.ADMIN)
  async toggleDocument(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.aiService.toggleDocument(id, isActive);
  }

  /**
   * DELETE /api/ai/documents/:id
   * Permanently delete a document and all its chunks.
   */
  @Delete('documents/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Param('id') id: string) {
    await this.aiService.deleteDocument(id);
  }
}
