-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('external', 'escrow', 'wallet', 'revenue');

-- CreateEnum
CREATE TYPE "LedgerTransactionKind" AS ENUM ('fund', 'release', 'refund');

-- AlterEnum
BEGIN;
CREATE TYPE "MilestoneStatus_new" AS ENUM ('pending_funding', 'funded', 'submitted', 'revision_requested', 'disputed', 'released', 'refunded', 'cancelled');
ALTER TABLE "public"."contract_milestones" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contract_milestones" ALTER COLUMN "status" TYPE "MilestoneStatus_new" USING ("status"::text::"MilestoneStatus_new");
ALTER TYPE "MilestoneStatus" RENAME TO "MilestoneStatus_old";
ALTER TYPE "MilestoneStatus_new" RENAME TO "MilestoneStatus";
DROP TYPE "public"."MilestoneStatus_old";
ALTER TABLE "contract_milestones" ALTER COLUMN "status" SET DEFAULT 'pending_funding';
COMMIT;

-- AlterTable
ALTER TABLE "contract_milestones" ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMPTZ(3),
ADD COLUMN     "disputedById" UUID,
ADD COLUMN     "fundedAt" TIMESTAMPTZ(3),
ADD COLUMN     "releaseDueAt" TIMESTAMPTZ(3),
ADD COLUMN     "resolvedById" UUID,
ADD COLUMN     "revisionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "revisionNote" TEXT,
ADD COLUMN     "settledAt" TIMESTAMPTZ(3),
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3);

-- AlterTable
-- Contracts made before this column existed get the default delay (7 days); new ones copy it in.
ALTER TABLE "contracts" ADD COLUMN     "autoReleaseHours" INTEGER NOT NULL DEFAULT 168,
ADD COLUMN     "completedAt" TIMESTAMPTZ(3);
ALTER TABLE "contracts" ALTER COLUMN "autoReleaseHours" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "scopeKey" VARCHAR(120) NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "sandboxId" UUID,
    "userId" UUID,
    "milestoneId" UUID,
    "balanceCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" "LedgerTransactionKind" NOT NULL,
    "milestoneId" UUID NOT NULL,
    "sandboxId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amountCents" BIGINT NOT NULL,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "userId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("userId","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_scopeKey_key" ON "ledger_accounts"("scopeKey");

-- CreateIndex
CREATE INDEX "ledger_accounts_userId_idx" ON "ledger_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_milestoneId_kind_key" ON "ledger_transactions"("milestoneId", "kind");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_idx" ON "ledger_entries"("accountId");

-- CreateIndex
CREATE INDEX "contract_milestones_status_releaseDueAt_idx" ON "contract_milestones"("status", "releaseDueAt");

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "contract_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "contract_milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Ledger rules the database enforces (not expressible in the Prisma schema) ───────────────────────

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_auto_release" CHECK ("autoReleaseHours" > 0);
ALTER TABLE "contract_milestones" ADD CONSTRAINT "contract_milestones_revisions"
  CHECK ("revisionCount" BETWEEN 0 AND 2);

-- No negative balances, except the outside world's (money comes from there).
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_not_negative"
  CHECK ("kind" = 'external' OR "balanceCents" >= 0);
-- Each kind of account carries exactly what identifies it.
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_shape" CHECK (
  ("kind" = 'escrow') = ("milestoneId" IS NOT NULL) AND ("kind" = 'wallet') = ("userId" IS NOT NULL)
);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_not_zero" CHECK ("amountCents" <> 0);

-- The cached balance moves with every entry, in the same statement: it can't drift from the entries.
CREATE FUNCTION ledger_apply_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "ledger_accounts" SET "balanceCents" = "balanceCents" + NEW."amountCents" WHERE "id" = NEW."accountId";
  RETURN NEW;
END $$;
CREATE TRIGGER "ledger_entries_apply" AFTER INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_apply_entry();

-- At commit: every transaction has at least two entries, they add up to zero, and all of its accounts
-- are in the transaction's sandbox.
CREATE FUNCTION ledger_check_transaction(transaction_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
  entry_count int;
  strangers int;
BEGIN
  SELECT COALESCE(SUM(e."amountCents"), 0), COUNT(*) INTO total, entry_count
    FROM "ledger_entries" e WHERE e."transactionId" = transaction_id;
  IF entry_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % does not balance (% entries, sum %)', transaction_id, entry_count, total
      USING ERRCODE = '23514';
  END IF;
  SELECT COUNT(*) INTO strangers
    FROM "ledger_entries" e
    JOIN "ledger_accounts" a ON a."id" = e."accountId"
    JOIN "ledger_transactions" t ON t."id" = e."transactionId"
    WHERE e."transactionId" = transaction_id AND a."sandboxId" IS DISTINCT FROM t."sandboxId";
  IF strangers > 0 THEN
    RAISE EXCEPTION 'ledger transaction % touches accounts of another sandbox', transaction_id
      USING ERRCODE = '23514';
  END IF;
END $$;

CREATE FUNCTION ledger_check_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ledger_check_transaction(NEW."transactionId");
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ledger_entries_balanced" AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_entry();

CREATE FUNCTION ledger_check_new_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ledger_check_transaction(NEW."id");
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ledger_transactions_balanced" AFTER INSERT ON "ledger_transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_new_transaction();

-- Append-only: what was booked stays booked. The one exception is removing a demo sandbox (whole,
-- balanced transactions), which sets lance.ledger_purge for its own transaction.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') AND current_setting('lance.ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'the ledger is append-only (% on %)', TG_OP, TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER "ledger_transactions_append_only" BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();
CREATE TRIGGER "ledger_transactions_no_truncate" BEFORE TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_append_only();
