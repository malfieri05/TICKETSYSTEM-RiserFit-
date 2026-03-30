import { IsString, MaxLength, MinLength } from 'class-validator';

export class ValidateInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;
}
