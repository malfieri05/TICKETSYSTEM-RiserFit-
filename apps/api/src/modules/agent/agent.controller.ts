import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AgentService, AgentResponse } from './agent.service';
import { AgentChatDto, AgentConfirmDto } from './dto/agent.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /api/agent/chat
   * Send a message to the AI agent. Returns an answer, tool results, or an action plan.
   */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() dto: AgentChatDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentResponse> {
    this.logger.log(
      `Agent chat from ${user.id}: "${dto.message.slice(0, 80)}..."`,
    );
    return this.agentService.chat(
      dto.message,
      user,
      dto.conversationId,
      dto.allowWebSearch,
    );
  }

  /**
   * POST /api/agent/chat-stream
   * Same semantics as `/agent/chat` but streams the model response as
   * Server-Sent Events. The client receives one `data:` frame per
   * `AgentStreamEvent` (start, thinking, delta, done, error).
   *
   * Additive endpoint — the original `/agent/chat` JSON endpoint is
   * unchanged so old clients keep working.
   */
  @Post('chat-stream')
  @HttpCode(HttpStatus.OK)
  async chatStream(
    @Body() dto: AgentChatDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Agent chat-stream from ${user.id}: "${dto.message.slice(0, 80)}..."`,
    );

    // SSE headers. `no-transform` tells the global compression middleware
    // to skip this response — gzip would buffer the stream and defeat the
    // entire point of token-by-token delivery.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
    res.flushHeaders();

    // If the client disconnects mid-stream, stop pushing events.
    let clientClosed = false;
    req.on('close', () => {
      clientClosed = true;
    });

    const writeEvent = (event: unknown) => {
      if (clientClosed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.agentService.chatStream(
        dto.message,
        user,
        dto.conversationId,
      )) {
        if (clientClosed) break;
        writeEvent(event);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Agent chat-stream failed: ${message}`);
      writeEvent({ type: 'error', message });
    } finally {
      if (!clientClosed) res.end();
    }
  }

  /**
   * POST /api/agent/confirm
   * Confirm a pending action plan and execute it.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Body() dto: AgentConfirmDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentResponse> {
    this.logger.log(
      `Agent confirm from ${user.id}: convo=${dto.conversationId}, msg=${dto.messageId}`,
    );
    return this.agentService.confirmAction(
      dto.conversationId,
      dto.messageId,
      user,
    );
  }

  /**
   * GET /api/agent/conversations
   * List the current user's agent conversations.
   */
  @Get('conversations')
  getConversations(@CurrentUser() user: RequestUser) {
    return this.agentService.getConversations(user.id);
  }

  /**
   * GET /api/agent/conversations/:id/messages
   * Get all messages in a conversation.
   */
  @Get('conversations/:id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.agentService.getMessages(id, user.id);
  }
}
