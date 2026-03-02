import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { RequestUploadUrlDto, ConfirmUploadDto } from './dto/attachments.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

// ── Ticket-scoped attachment routes ──────────────────────────────────────────
// POST   /api/tickets/:ticketId/attachments/upload-url  — get presigned PUT URL
// POST   /api/tickets/:ticketId/attachments/confirm     — confirm upload, save DB record
// GET    /api/tickets/:ticketId/attachments             — list attachments for ticket
//
// ── Individual attachment routes ─────────────────────────────────────────────
// GET    /api/attachments/:id/download-url              — get presigned GET URL
// DELETE /api/attachments/:id                           — delete from S3 + DB

@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  // Step 1 — client requests a presigned upload URL
  @Post('tickets/:ticketId/attachments/upload-url')
  requestUploadUrl(
    @Param('ticketId') ticketId: string,
    @Body() dto: RequestUploadUrlDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.requestUploadUrl(ticketId, dto, user.id);
  }

  // Step 2 — client confirms upload is complete → we persist the DB record
  @Post('tickets/:ticketId/attachments/confirm')
  @HttpCode(HttpStatus.CREATED)
  confirmUpload(
    @Param('ticketId') ticketId: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: RequestUser,
  ) {
    const { s3Key, ...uploadDto } = dto;
    return this.attachmentsService.confirmUpload(ticketId, s3Key, uploadDto, user.id);
  }

  // List all attachments for a ticket
  @Get('tickets/:ticketId/attachments')
  listAttachments(@Param('ticketId') ticketId: string) {
    return this.attachmentsService.listAttachments(ticketId);
  }

  // Get a presigned download URL for a single attachment
  @Get('attachments/:id/download-url')
  getDownloadUrl(@Param('id') id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }

  // Delete an attachment (removes from S3 + DB)
  @Delete('attachments/:id')
  @HttpCode(HttpStatus.OK)
  deleteAttachment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.attachmentsService.deleteAttachment(id, user.id);
  }
}
