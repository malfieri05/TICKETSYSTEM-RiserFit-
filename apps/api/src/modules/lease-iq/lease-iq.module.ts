import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { LeaseSourceService } from './services/lease-source.service';
import { LeaseRuleSetService } from './services/lease-rule-set.service';
import { LeaseParseService } from './services/lease-parse.service';
import { TextNormalizerService } from './services/text-normalizer.service';
import { LeaseEvaluationService } from './services/lease-evaluation.service';
import { LeaseIQController } from './lease-iq.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [LeaseIQController],
  providers: [
    LeaseSourceService,
    LeaseRuleSetService,
    LeaseParseService,
    TextNormalizerService,
    LeaseEvaluationService,
  ],
  exports: [LeaseSourceService, LeaseRuleSetService, LeaseEvaluationService],
})
export class LeaseIQModule {}
