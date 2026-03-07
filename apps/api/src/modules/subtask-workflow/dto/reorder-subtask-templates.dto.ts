import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class ReorderSubtaskTemplatesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(0)
  subtaskTemplateIds: string[];
}
