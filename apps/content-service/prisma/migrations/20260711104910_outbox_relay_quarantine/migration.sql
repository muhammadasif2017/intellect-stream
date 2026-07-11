-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutboxMessage_publishedAt_occurredAt_idx" ON "OutboxMessage"("publishedAt", "occurredAt");
