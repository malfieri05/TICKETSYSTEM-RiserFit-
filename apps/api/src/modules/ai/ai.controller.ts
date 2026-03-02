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
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiService } from './ai.service';
import { IngestionService } from './ingestion.service';
import { ChatDto, IngestTextDto } from './dto/ai.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

// 10MB max for plain-text / markdown document uploads
const MAX_DOC_SIZE = 10 * 1024 * 1024;

@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly ingestionService: IngestionService,
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

  // ── Knowledge base management (ADMIN only) ─────────────────────────────

  /**
   * GET /api/ai/documents
   * List all knowledge base documents.
   */
  @Get('documents')
  @Roles(Role.ADMIN)
  listDocuments() {
    return this.aiService.listDocuments();
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
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(txt|md)$/i)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only .txt and .md files are supported for ingestion'), false);
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
    this.logger.log(`Admin ${user.id} ingesting file: "${file.originalname}" (${file.size} bytes)`);

    return this.ingestionService.ingestText(title.trim(), content, user.id, {
      sourceType: 'file',
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
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
