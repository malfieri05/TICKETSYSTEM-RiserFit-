import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionService } from '../../modules/ai/ingestion.service';
import {
  QUEUES,
  KnowledgeIngestionJobData,
} from '../../common/queue/queue.constants';

@Processor(QUEUES.KNOWLEDGE_INGESTION, { concurrency: 2 })
export class KnowledgeIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(KnowledgeIngestionProcessor.name);

  constructor(private readonly ingestionService: IngestionService) {
    super();
  }

  async process(
    job: Job<KnowledgeIngestionJobData, void, string>,
  ): Promise<void> {
    const { documentId } = job.data;
    try {
      await this.ingestionService.runIngestionForDocument(documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Knowledge ingestion failed for documentId=${documentId}: ${message}`,
      );
      throw err;
    }
  }
}
