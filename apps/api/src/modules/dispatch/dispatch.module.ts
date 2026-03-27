import { Module } from '@nestjs/common';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { DispatchController } from './dispatch.controller';
import { DispatchClassificationService } from './services/dispatch-classification.service';
import { DispatchRecommendationService } from './services/dispatch-recommendation.service';
import { DispatchGroupService } from './services/dispatch-group.service';
import { DispatchTemplateService } from './services/dispatch-template.service';

@Module({
  imports: [AuditLogModule],
  controllers: [DispatchController],
  providers: [
    DispatchClassificationService,
    DispatchRecommendationService,
    DispatchGroupService,
    DispatchTemplateService,
  ],
  exports: [
    DispatchClassificationService,
    DispatchRecommendationService,
    DispatchGroupService,
    DispatchTemplateService,
  ],
})
export class DispatchModule {}
