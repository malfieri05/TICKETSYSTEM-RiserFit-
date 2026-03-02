import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateCommentDto } from './dto/create-comment.dto';
import { IsString, IsNotEmpty } from 'class-validator';

class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  body: string;
}

@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // POST /api/tickets/:ticketId/comments
  @Post()
  create(
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.create(ticketId, dto, user);
  }

  // GET /api/tickets/:ticketId/comments
  @Get()
  findAll(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.findByTicket(ticketId, user);
  }

  // PATCH /api/tickets/:ticketId/comments/:commentId
  @Patch(':commentId')
  update(
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.commentsService.update(commentId, dto.body, user);
  }
}
