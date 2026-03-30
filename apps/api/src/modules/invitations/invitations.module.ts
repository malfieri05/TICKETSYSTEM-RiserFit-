import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { InvitationsService } from './invitations.service';
import { InvitationsPublicController } from './invitations-public.controller';
import { InvitationsAdminController } from './invitations-admin.controller';
import { InviteMailService } from './invite-mail.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AuditLogModule } from '../../common/audit-log/audit-log.module';
import { QUEUES } from '../../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.INVITE_EMAIL }),
    UsersModule,
    AuthModule,
    AuditLogModule,
  ],
  controllers: [InvitationsPublicController, InvitationsAdminController],
  providers: [InvitationsService, InviteMailService],
  exports: [InvitationsService, InviteMailService],
})
export class InvitationsModule {}
