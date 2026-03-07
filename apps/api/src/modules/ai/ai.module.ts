import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiService } from './ai.service';
import { IngestionService } from './ingestion.service';
import { AiController } from './ai.controller';
import { AttachmentsModule } from '../attachments/attachments.module';
import { QUEUES } from '../../common/queue/queue.constants';

@Module({
  imports: [
    AttachmentsModule,
    BullModule.registerQueue({ name: QUEUES.KNOWLEDGE_INGESTION }),
  ],
  controllers: [AiController],
  providers: [AiService, IngestionService],
  exports: [AiService, IngestionService],
})
export class AiModule {}
