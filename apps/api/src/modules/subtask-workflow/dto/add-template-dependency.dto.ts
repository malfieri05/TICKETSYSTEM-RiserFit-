import { IsString } from 'class-validator';

export class AddTemplateDependencyDto {
  @IsString()
  workflowTemplateId: string;

  @IsString()
  subtaskTemplateId: string;

  @IsString()
  dependsOnSubtaskTemplateId: string;
}
