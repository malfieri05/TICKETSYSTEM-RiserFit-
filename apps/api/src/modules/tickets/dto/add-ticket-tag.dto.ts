import { IsString, MaxLength } from 'class-validator';

export class AddTicketTagDto {
  @IsString()
  @MaxLength(80)
  label!: string;
}
