import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const TAG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export class AddTicketTagDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @IsIn(TAG_COLORS)
  color?: TagColor;
}
