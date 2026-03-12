import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TicketStatus, Priority } from '@prisma/client';

export class TicketFiltersDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  /** Convenience filter: 'active' = status notIn [RESOLVED, CLOSED]; 'completed' = status in [RESOLVED, CLOSED]. Overrides `status` when set. */
  @IsOptional()
  @IsString()
  @IsIn(['active', 'completed'])
  statusGroup?: 'active' | 'completed';

  @IsOptional()
  @IsString()
  ticketClassId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  supportTopicId?: string;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string;

  /** For STUDIO_USER: must be one of the user's allowed studios (primary + scope) or request returns 403. */
  @IsOptional()
  @IsString()
  studioId?: string;

  @IsOptional()
  @IsString()
  marketId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  requesterId?: string;

  /** Optional filter by team (e.g. from frontend); accepted to avoid 400 when client sends it. */
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** When true (default), list includes comment/subtask/attachment counts. Set false for faster list load. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeCounts?: boolean = true;

  /** When true and search is set, only search in title (faster). Default false = search title + description. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  searchInTitleOnly?: boolean = false;

  /** Stage 4: when true, restrict to tickets with at least one READY subtask for the current user's department or assigned to them. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  actionableForMe?: boolean = false;

  // Date range filters
  @IsOptional()
  @IsDateString()
  createdAfter?: string;

  @IsOptional()
  @IsDateString()
  createdBefore?: string;

  // Pagination
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
