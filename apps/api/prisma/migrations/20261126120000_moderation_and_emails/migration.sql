-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('project', 'profile', 'message', 'review');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('spam', 'fraud', 'offensive', 'off_platform', 'other');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'actioned', 'dismissed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailOptOuts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "sandboxId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,
    "resolution" VARCHAR(20),
    "note" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "targetType" VARCHAR(30) NOT NULL,
    "targetId" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "sandboxId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_digests" (
    "userId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "sandboxId" UUID,

    CONSTRAINT "pending_digests_pkey" PRIMARY KEY ("userId","conversationId")
);

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_targetType_targetId_key" ON "reports"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_entries_sandboxId_createdAt_idx" ON "audit_entries"("sandboxId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "pending_digests_dueAt_idx" ON "pending_digests"("dueAt");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_digests" ADD CONSTRAINT "pending_digests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_digests" ADD CONSTRAINT "pending_digests_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A report is open until someone resolves it, and then says how.
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolution_valid" CHECK (
  ("status" = 'open' AND "resolvedAt" IS NULL AND "resolution" IS NULL)
  OR ("status" = 'actioned' AND "resolvedAt" IS NOT NULL AND "resolution" IN ('hidden', 'suspended'))
  OR ("status" = 'dismissed' AND "resolvedAt" IS NOT NULL AND "resolution" = 'dismissed')
);
ALTER TABLE "reports" ADD CONSTRAINT "reports_details_length" CHECK (char_length("details") <= 1000);

-- The audit log is append-only: no UPDATE, no DELETE, no TRUNCATE. The one way out is removing whole
-- demo sandboxes (and tests resetting the database), which set lance.purge for their own transaction.
CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') AND current_setting('lance.purge', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NULL END;
  END IF;
  RAISE EXCEPTION 'the audit log is append-only (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER "audit_entries_append_only" BEFORE UPDATE OR DELETE ON "audit_entries"
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();
CREATE TRIGGER "audit_entries_no_truncate" BEFORE TRUNCATE ON "audit_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_append_only();
