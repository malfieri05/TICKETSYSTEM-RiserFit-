import { IsString } from 'class-validator';

export class RemoveTemplateDependencyDto {
  @IsString()
  subtaskTemplateId: string;

  @IsString()
  dependsOnSubtaskTemplateId: string;
}
