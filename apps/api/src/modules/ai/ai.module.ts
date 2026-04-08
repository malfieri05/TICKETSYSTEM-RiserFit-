import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiService } from './ai.service';
import { IngestionService } from './ingestion.service';
import { AiController } from './ai.controller';
import { AttachmentsModule } from '../attachments/attachments.module';
import { QUEUES } from '../../common/queue/queue.constants';
import { RiserPolicySyncService } from './riser-policy-sync.service';
import { HybridRetrievalService } from './hybrid-retrieval.service';

@Module({
  imports: [
    AttachmentsModule,
    BullModule.registerQueue({ name: QUEUES.KNOWLEDGE_INGESTION }),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    IngestionService,
    RiserPolicySyncService,
    HybridRetrievalService,
  ],
  exports: [
    AiService,
    IngestionService,
    RiserPolicySyncService,
    HybridRetrievalService,
  ],
})
export class AiModule {}
