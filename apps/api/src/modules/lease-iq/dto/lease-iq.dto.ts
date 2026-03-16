import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LeaseRuleType,
  LeaseRuleTermType,
} from '@prisma/client';

export class LeaseRuleTermDto {
  @IsString()
  term!: string;

  @IsEnum(LeaseRuleTermType)
  termType!: LeaseRuleTermType;
}

export class LeaseRuleDto {
  @IsEnum(LeaseRuleType)
  ruleType!: LeaseRuleType;

  @IsOptional()
  @IsString()
  categoryScope?: string | null;

  @IsOptional()
  @IsString()
  clauseReference?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaseRuleTermDto)
  terms!: LeaseRuleTermDto[];
}

export class PasteSourceDto {
  @IsString()
  pastedText!: string;
}

export class UpdateRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeaseRuleDto)
  rules!: LeaseRuleDto[];
}

export class PublishDto {
  @IsString()
  rulesetId!: string;
}

export class PlaygroundDto {
  @IsString()
  studioId!: string;

  @IsOptional()
  @IsString()
  maintenanceCategoryId?: string | null;

  @IsString()
  title!: string;

  @IsString()
  description!: string;
}

export interface ParsedRuleDto {
  ruleType: LeaseRuleType;
  categoryScope: string | null;
  clauseReference: string | null;
  notes: string | null;
  priority: number;
  terms: { term: string; termType: LeaseRuleTermType }[];
}
