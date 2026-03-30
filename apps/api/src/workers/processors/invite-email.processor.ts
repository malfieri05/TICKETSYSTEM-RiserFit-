import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InviteMailService } from '../../modules/invitations/invite-mail.service';
import {
  QUEUES,
  type InviteEmailJobData,
} from '../../common/queue/queue.constants';

@Processor(QUEUES.INVITE_EMAIL)
export class InviteEmailProcessor extends WorkerHost {
  constructor(private readonly mail: InviteMailService) {
    super();
  }

  async process(job: Job<InviteEmailJobData>): Promise<void> {
    await this.mail.sendInvite(job.data);
  }
}
