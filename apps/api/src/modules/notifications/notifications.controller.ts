import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Sse,
  OnModuleDestroy,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Observable, fromEvent } from 'rxjs';
import { map } from 'rxjs/operators';
import { NotificationsService } from './notifications.service';
import { SseChannel } from './channels/sse.channel';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/strategies/jwt.strategy';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

class GetNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

class SetPreferenceDto {
  @IsString()
  eventType: string;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  teams?: boolean;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sseChannel: SseChannel,
  ) {}

  /**
   * SSE endpoint — client subscribes here and receives real-time push notifications.
   * The browser keeps this connection open with EventSource API.
   *
   * GET /api/notifications/stream
   */
  @Sse('stream')
  stream(
    @CurrentUser() user: RequestUser,
    @Req() req: any,
  ): Observable<MessageEvent> {
    const subject = this.sseChannel.subscribe(user.id);

    // Clean up when client disconnects
    req.on('close', () => {
      this.sseChannel.unsubscribe(user.id);
    });

    return subject.asObservable().pipe(
      map(
        (msg) =>
          ({
            type: msg.type,
            data: msg.data,
          }) as MessageEvent,
      ),
    );
  }

  /**
   * GET /api/notifications?page=1&limit=20
   * Returns paginated notifications + unread count for notification bell UI.
   */
  @Get()
  findAll(@Query() dto: GetNotificationsDto, @CurrentUser() user: RequestUser) {
    return this.notificationsService.findForUser(user.id, dto.page, dto.limit);
  }

  /**
   * PATCH /api/notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.notificationsService.markRead(id, user.id);
  }

  /**
   * POST /api/notifications/read-all
   * Mark all notifications as read ("Mark all as read" button).
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user.id);
  }

  /**
   * GET /api/notifications/preferences
   * Fetch user's notification preferences.
   */
  @Get('preferences')
  getPreferences(@CurrentUser() user: RequestUser) {
    return this.notificationsService.getPreferences(user.id);
  }

  /**
   * POST /api/notifications/preferences
   * Update a user's notification preference for a specific event type.
   */
  @Post('preferences')
  @HttpCode(HttpStatus.OK)
  setPreference(
    @Body() dto: SetPreferenceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notificationsService.setPreference(user.id, dto.eventType, {
      email: dto.email,
      inApp: dto.inApp,
      teams: dto.teams,
    });
  }
}
