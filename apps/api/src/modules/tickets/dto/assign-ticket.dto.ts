import { IsString, IsNotEmpty } from 'class-validator';

export class AssignTicketDto {
  @IsString()
  @IsNotEmpty()
  ownerId: string;
}
