-- CreateIndex
CREATE INDEX "tickets_updatedAt_idx" ON "tickets"("updatedAt");

-- CreateIndex
CREATE INDEX "tickets_resolvedAt_idx" ON "tickets"("resolvedAt");

-- CreateIndex
CREATE INDEX "notifications_userId_ticketId_eventType_createdAt_idx" ON "notifications"("userId", "ticketId", "eventType", "createdAt");
