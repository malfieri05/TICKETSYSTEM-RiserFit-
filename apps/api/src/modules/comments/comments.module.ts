import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { MentionParserService } from './mention-parser.service';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuditLogModule, EventsModule],
  controllers: [CommentsController],
  providers: [CommentsService, MentionParserService],
  exports: [CommentsService],
})
export class CommentsModule {}
