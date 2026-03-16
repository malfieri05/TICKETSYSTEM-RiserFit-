import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES } from '../../common/queue/queue.constants';
import { GmailIngestService } from '../../modules/email-automation/services/gmail-ingest.service';
import { EmailClassifierService } from '../../modules/email-automation/services/email-classifier.service';
import { EmailAutomationOrchestratorService } from '../../modules/email-automation/services/email-automation-orchestrator.service';
import { AssemblyTicketCreateService } from '../../modules/email-automation/services/assembly-ticket-create.service';
import { AutomationLockService } from '../../modules/email-automation/services/automation-lock.service';

const JOB_NAME = 'email-ingest-run';

/**
 * EmailIngestProcessor — runs on a repeatable schedule (e.g. every 20 min).
 * 1) Gmail ingest: poll by time window, dedupe by messageId, store raw.
 * 2) Classify unprocessed emails.
 * 3) Process ORDER_CONFIRMATION emails: extract and persist orders or create review items.
 */
@Processor(QUEUES.EMAIL_INGEST)
export class EmailIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailIngestProcessor.name);

  constructor(
    private readonly gmailIngest: GmailIngestService,
    private readonly emailClassifier: EmailClassifierService,
    private readonly orchestrator: EmailAutomationOrchestratorService,
    private readonly assemblyTicketCreate: AssemblyTicketCreateService,
    private readonly automationLock: AutomationLockService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_NAME) return;

    await this.automationLock.purgeExpiredOrReleasedLocks();

    this.logger.log('Running Gmail ingest…');
    const ingestResult = await this.gmailIngest.runIngest();
    this.logger.log(
      `Gmail ingest complete: fetched=${ingestResult.fetched}, stored=${ingestResult.stored}, skipped=${ingestResult.skipped}`,
    );

    const classifyResult = await this.emailClassifier.classifyUnprocessedEmails();
    if (classifyResult.processed > 0) {
      this.logger.log(`Classified ${classifyResult.processed} emails`);
    }

    const orderResult = await this.orchestrator.processOrderConfirmations();
    if (orderResult.processed > 0) {
      this.logger.log(
        `Order path: processed=${orderResult.processed}, ordersCreated=${orderResult.ordersCreated}, reviewCreated=${orderResult.reviewCreated}`,
      );
    }

    const deliveryResult = await this.orchestrator.processDeliveryConfirmations();
    if (deliveryResult.processed > 0) {
      this.logger.log(
        `Delivery path: processed=${deliveryResult.processed}, deliveryRecorded=${deliveryResult.deliveryRecorded}, completeNoAssembly=${deliveryResult.completeNoAssembly}, reviewCreated=${deliveryResult.reviewCreated}`,
      );
    }

    const ticketResult = await this.assemblyTicketCreate.processRecordedDeliveries();
    if (ticketResult.processed > 0) {
      this.logger.log(
        `Assembly tickets: processed=${ticketResult.processed}, ticketsCreated=${ticketResult.ticketsCreated}, reviewCreated=${ticketResult.reviewCreated}`,
      );
    }
  }
}
