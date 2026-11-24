-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('submitted', 'withdrawn', 'declined', 'accepted');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('pending_funding', 'funded', 'submitted', 'revision_requested', 'approved', 'disputed', 'released', 'refunded', 'cancelled');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "sandboxId" UUID,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "skills" TEXT[],
    "budgetMinCents" BIGINT NOT NULL,
    "budgetMaxCents" BIGINT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "hiddenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "freelancerId" UUID NOT NULL,
    "sandboxId" UUID,
    "coverLetter" TEXT NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "milestones" JSONB NOT NULL,
    "priceCents" BIGINT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'submitted',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "freelancerId" UUID NOT NULL,
    "sandboxId" UUID,
    "priceCents" BIGINT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_milestones" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'pending_funding',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "freelancerId" UUID NOT NULL,
    "sandboxId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_status_publishedAt_id_idx" ON "projects"("status", "publishedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");

-- CreateIndex
CREATE INDEX "proposals_freelancerId_idx" ON "proposals"("freelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "proposals_projectId_freelancerId_key" ON "proposals"("projectId", "freelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_projectId_key" ON "contracts"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_proposalId_key" ON "contracts"("proposalId");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "contracts_freelancerId_idx" ON "contracts"("freelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_milestones_contractId_position_key" ON "contract_milestones"("contractId", "position");

-- CreateIndex
CREATE INDEX "conversations_clientId_idx" ON "conversations"("clientId");

-- CreateIndex
CREATE INDEX "conversations_freelancerId_idx" ON "conversations"("freelancerId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_projectId_freelancerId_key" ON "conversations"("projectId", "freelancerId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_milestones" ADD CONSTRAINT "contract_milestones_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database keeps even if application code gets them wrong (not expressible in the Prisma schema).
ALTER TABLE "projects" ADD CONSTRAINT "projects_budget_range"
  CHECK ("budgetMinCents" > 0 AND "budgetMinCents" <= "budgetMaxCents");
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_positive"
  CHECK ("priceCents" > 0 AND "deliveryDays" > 0 AND "version" > 0);
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_price_and_fee"
  CHECK ("priceCents" > 0 AND "feeBps" BETWEEN 0 AND 10000);
ALTER TABLE "contract_milestones" ADD CONSTRAINT "contract_milestones_positive"
  CHECK ("amountCents" > 0 AND "position" > 0);
-- Nobody proposes on, or contracts with, themselves.
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_two_parties" CHECK ("clientId" <> "freelancerId");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_two_parties" CHECK ("clientId" <> "freelancerId");
