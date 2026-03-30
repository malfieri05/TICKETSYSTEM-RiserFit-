import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role, Department } from '@prisma/client';
import { normalizeInviteEmail } from '../invitation-token.util';

export class CreateInvitationDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeInviteEmail(value) : value,
  )
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  seedName!: string;

  @IsEnum(Role)
  assignedRole!: Role;

  @ValidateIf((o) => o.assignedRole === Role.DEPARTMENT_USER)
  @IsArray()
  @IsEnum(Department, { each: true })
  departments?: Department[];

  @ValidateIf((o) => o.assignedRole === Role.STUDIO_USER)
  @IsString()
  @MinLength(1)
  defaultStudioId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  additionalStudioIds?: string[];
}
