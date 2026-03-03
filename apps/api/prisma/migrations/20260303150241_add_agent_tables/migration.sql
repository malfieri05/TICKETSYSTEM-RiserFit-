-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT,
    "toolCalls" JSONB,
    "toolResults" JSONB,
    "mode" TEXT,
    "actionPlan" JSONB,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_action_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolArgs" JSONB NOT NULL,
    "resultSummary" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "executionMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_conversations_userId_isActive_idx" ON "agent_conversations"("userId", "isActive");

-- CreateIndex
CREATE INDEX "agent_conversations_createdAt_idx" ON "agent_conversations"("createdAt");

-- CreateIndex
CREATE INDEX "agent_messages_conversationId_idx" ON "agent_messages"("conversationId");

-- CreateIndex
CREATE INDEX "agent_action_logs_userId_idx" ON "agent_action_logs"("userId");

-- CreateIndex
CREATE INDEX "agent_action_logs_conversationId_idx" ON "agent_action_logs"("conversationId");

-- CreateIndex
CREATE INDEX "agent_action_logs_toolName_idx" ON "agent_action_logs"("toolName");

-- CreateIndex
CREATE INDEX "agent_action_logs_createdAt_idx" ON "agent_action_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_action_logs" ADD CONSTRAINT "agent_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
