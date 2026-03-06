import { Module } from '@nestjs/common';
import { TicketFormsController } from './ticket-forms.controller';
import { TicketFormsService } from './ticket-forms.service';

@Module({
  controllers: [TicketFormsController],
  providers: [TicketFormsService],
  exports: [TicketFormsService],
})
export class TicketFormsModule {}
