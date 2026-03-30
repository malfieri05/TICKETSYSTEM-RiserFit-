import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(128)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;
}
