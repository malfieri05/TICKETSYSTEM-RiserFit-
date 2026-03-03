import {
  Controller, Post, Get, Param, Body, HttpCode, HttpStatus, Logger,
} from '@nestjs/common';
import { AgentService } from './agent.service';
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
  ) {
    this.logger.log(`Agent chat from ${user.id}: "${dto.message.slice(0, 80)}..."`);
    return this.agentService.chat(dto.message, user, dto.conversationId, dto.allowWebSearch);
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
  ) {
    this.logger.log(`Agent confirm from ${user.id}: convo=${dto.conversationId}, msg=${dto.messageId}`);
    return this.agentService.confirmAction(dto.conversationId, dto.messageId, user);
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
  getMessages(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.agentService.getMessages(id, user.id);
  }
}
