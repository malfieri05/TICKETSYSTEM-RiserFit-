import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [AuditLogModule, EventsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
