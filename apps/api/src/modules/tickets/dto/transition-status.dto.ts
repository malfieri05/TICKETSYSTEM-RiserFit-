import { IsEnum } from 'class-validator';
import { TicketStatus } from '@prisma/client';

export class TransitionStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
