-- DropIndex
DROP INDEX "conversations_clientId_idx";

-- DropIndex
DROP INDEX "conversations_freelancerId_idx";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "clientReadSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freelancerReadSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastMessageAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastSeq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "senderId" UUID NOT NULL,
    "clientMessageId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "contactFlags" TEXT[],
    "hiddenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_seq_key" ON "messages"("conversationId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "messages_senderId_clientMessageId_key" ON "messages"("senderId", "clientMessageId");

-- CreateIndex
CREATE INDEX "conversations_clientId_lastMessageAt_idx" ON "conversations"("clientId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "conversations_freelancerId_lastMessageAt_idx" ON "conversations"("freelancerId", "lastMessageAt" DESC);

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Not expressible in the Prisma schema.
ALTER TABLE "messages" ADD CONSTRAINT "messages_seq_positive" CHECK ("seq" > 0);
ALTER TABLE "messages" ADD CONSTRAINT "messages_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_read_within"
  CHECK ("clientReadSeq" BETWEEN 0 AND "lastSeq" AND "freelancerReadSeq" BETWEEN 0 AND "lastSeq");
