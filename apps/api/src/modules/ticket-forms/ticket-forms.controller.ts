import { Controller, Get, Query } from '@nestjs/common';
import { TicketFormsService } from './ticket-forms.service';
import { TicketFormSchemaQueryDto } from './dto/schema-query.dto';

@Controller('ticket-forms')
export class TicketFormsController {
  constructor(private readonly ticketFormsService: TicketFormsService) {}

  /**
   * GET /ticket-forms/schema?ticketClassId=&departmentId=&supportTopicId=
   * or ?ticketClassId=&maintenanceCategoryId=
   * Returns the form schema (fields + options) for the given context.
   */
  @Get('schema')
  getSchema(@Query() query: TicketFormSchemaQueryDto) {
    return this.ticketFormsService.getSchema({
      ticketClassId: query.ticketClassId,
      departmentId: query.departmentId,
      supportTopicId: query.supportTopicId,
      maintenanceCategoryId: query.maintenanceCategoryId,
    });
  }
}
