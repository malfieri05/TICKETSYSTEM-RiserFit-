import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { TicketsModule } from '../tickets/tickets.module';
import { EmailAutomationConfigService } from './services/email-automation-config.service';
import { GmailIngestService } from './services/gmail-ingest.service';
import { GmailOAuthService } from './services/gmail-oauth.service';
import { EmailClassifierService } from './services/email-classifier.service';
import { OrderExtractorService } from './services/order-extractor.service';
import { EmailAutomationOrchestratorService } from './services/email-automation-orchestrator.service';
import { AssemblyTriggerService } from './services/assembly-trigger.service';
import { AddressMatchingService } from './services/address-matching.service';
import { DeliveryExtractorService } from './services/delivery-extractor.service';
import { DeliveryEventService } from './services/delivery-event.service';
import { AutomationLockService } from './services/automation-lock.service';
import { AssemblyTicketCreateService } from './services/assembly-ticket-create.service';
import { ReprocessEmailService } from './services/reprocess-email.service';
import { EmailPatternPlaygroundService } from './services/email-pattern-playground.service';
import { EmailAutomationController } from './email-automation.controller';

@Module({
  imports: [DatabaseModule, TicketsModule],
  controllers: [EmailAutomationController],
  providers: [
    EmailAutomationConfigService,
    GmailIngestService,
    GmailOAuthService,
    EmailClassifierService,
    OrderExtractorService,
    EmailAutomationOrchestratorService,
    AssemblyTriggerService,
    AddressMatchingService,
    DeliveryExtractorService,
    DeliveryEventService,
    AutomationLockService,
    AssemblyTicketCreateService,
    ReprocessEmailService,
    EmailPatternPlaygroundService,
  ],
  exports: [
    EmailAutomationConfigService,
    GmailIngestService,
    EmailClassifierService,
    OrderExtractorService,
    EmailAutomationOrchestratorService,
    AssemblyTriggerService,
    AddressMatchingService,
    DeliveryExtractorService,
    DeliveryEventService,
    AutomationLockService,
    AssemblyTicketCreateService,
  ],
})
export class EmailAutomationModule {}
