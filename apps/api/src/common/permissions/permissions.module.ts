import { Module } from '@nestjs/common';
import { TicketVisibilityService } from './ticket-visibility.service';

@Module({
  providers: [TicketVisibilityService],
  exports: [TicketVisibilityService],
})
export class PermissionsModule {}
