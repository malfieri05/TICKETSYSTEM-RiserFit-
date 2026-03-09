/**
 * DEV-ONLY: One-time script to wipe all ticket-derived runtime data.
 *
 * Use this to get a clean slate for testing the current ticket architecture
 * and workflow templates. All existing tickets and related operational data
 * are deleted. Structure/config (users, taxonomy, form schemas, workflow
 * templates, knowledge base, locations) is preserved.
 *
 * DO NOT run in production. No admin UI. No schema changes.
 *
 * Run: npm run reset:tickets (from apps/api)
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  console.log('\n=== DEV-ONLY: Reset ticket runtime data ===\n');

  if (process.env.NODE_ENV === 'production' && process.env.RESET_TICKETS_DEV !== '1') {
    console.error('Aborted: NODE_ENV=production. Set RESET_TICKETS_DEV=1 to override (still not recommended). This script is for local/dev only.');
    process.exit(1);
  }

  const [
    ticketCount,
    commentCount,
    attachmentCount,
    formResponseCount,
    subtaskCount,
    subtaskDepCount,
    ticketTagCount,
    watcherCount,
    notificationWithTicketCount,
    auditLogWithTicketCount,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticketComment.count(),
    prisma.ticketAttachment.count(),
    prisma.ticketFormResponse.count(),
    prisma.subtask.count(),
    prisma.subtaskDependency.count(),
    prisma.ticketTag.count(),
    prisma.ticketWatcher.count(),
    prisma.notification.count({ where: { ticketId: { not: null } } }),
    prisma.auditLog.count({ where: { ticketId: { not: null } } }),
  ]);

  const commentMentionCount = await prisma.commentMention.count({
    where: { comment: { ticketId: { not: undefined } } },
  });

  const notificationDeliveryCountForTicketNotifs = await prisma.notificationDelivery.count({
    where: { notification: { ticketId: { not: null } } },
  });

  console.log('The following will be DELETED (ticket-derived runtime data):');
  console.log('  tickets:                    ', ticketCount);
  console.log('  ticket_comments:            ', commentCount, '(cascade)');
  console.log('  comment_mentions:           ', commentMentionCount, '(cascade)');
  console.log('  ticket_attachments:         ', attachmentCount, '(cascade)');
  console.log('  ticket_form_responses:      ', formResponseCount, '(cascade)');
  console.log('  subtasks:                   ', subtaskCount, '(cascade)');
  console.log('  subtask_dependencies:       ', subtaskDepCount, '(cascade)');
  console.log('  ticket_tags:                ', ticketTagCount, '(cascade)');
  console.log('  ticket_watchers:            ', watcherCount, '(cascade)');
  console.log('  notifications (ticket-linked):', notificationWithTicketCount);
  console.log('  notification_deliveries:    ', notificationDeliveryCountForTicketNotifs, '(cascade from above)');
  console.log('  audit_logs (ticket-linked): ', auditLogWithTicketCount);
  console.log('');

  console.log('PRESERVED (unchanged):');
  console.log('  users, teams, markets, studios');
  console.log('  ticket_classes, departments, support_topics, maintenance_categories');
  console.log('  ticket_form_schemas, ticket_form_fields, ticket_form_field_options');
  console.log('  subtask_workflow_templates, subtask_templates, subtask_template_dependencies');
  console.log('  tags, notification_preferences');
  console.log('  knowledge_documents, document_chunks');
  console.log('  agent_conversations (and any other config/reference data)');
  console.log('');

  const total = ticketCount + notificationWithTicketCount + auditLogWithTicketCount;
  if (total === 0) {
    console.log('No ticket or ticket-linked rows to delete. Exiting.');
    await pool.end();
    process.exit(0);
  }

  console.log('Deleting in safe dependency order...\n');

  // 1. Notifications that reference a ticket (DB will cascade delete their NotificationDelivery rows)
  const delNotif = await prisma.notification.deleteMany({
    where: { ticketId: { not: null } },
  });
  console.log(`  Deleted ${delNotif.count} notification(s) (and their deliveries).`);

  // 2. Audit log rows that reference a ticket
  const delAudit = await prisma.auditLog.deleteMany({
    where: { ticketId: { not: null } },
  });
  console.log(`  Deleted ${delAudit.count} audit_log row(s).`);

  // 3. Tickets (DB CASCADE deletes: ticket_comments, comment_mentions, ticket_attachments,
  //    subtasks, subtask_dependencies, ticket_tags, ticket_watchers, ticket_form_responses)
  const delTickets = await prisma.ticket.deleteMany({});
  console.log(`  Deleted ${delTickets.count} ticket(s) (and all cascade children).`);

  console.log('\nDone. Ticket runtime data has been reset.\n');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
