-- CreateEnum
CREATE TYPE "ReviewRole" AS ENUM ('client', 'freelancer');

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "contractId" UUID,
    "authorId" UUID NOT NULL,
    "revieweeId" UUID NOT NULL,
    "revieweeRole" "ReviewRole" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "sandboxId" UUID,
    "hiddenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_revieweeId_revieweeRole_idx" ON "reviews"("revieweeId", "revieweeRole");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_contractId_authorId_key" ON "reviews"("contractId", "authorId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Not expressible in the Prisma schema.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_comment" CHECK (char_length("comment") BETWEEN 10 AND 1000);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_not_self" CHECK ("authorId" <> "revieweeId");
-- Only the seeded marketplace's history goes without a contract.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contract_or_seeded"
  CHECK ("contractId" IS NOT NULL OR "sandboxId" IS NULL);

-- A review can't be edited: only moderation's hiddenAt may change.
CREATE FUNCTION reviews_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."rating", NEW."comment", NEW."authorId", NEW."revieweeId", NEW."revieweeRole", NEW."contractId",
      NEW."sandboxId", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."rating", OLD."comment", OLD."authorId", OLD."revieweeId", OLD."revieweeRole", OLD."contractId",
      OLD."sandboxId", OLD."createdAt") THEN
    RAISE EXCEPTION 'reviews cannot be edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "reviews_immutable" BEFORE UPDATE ON "reviews" FOR EACH ROW EXECUTE FUNCTION reviews_immutable();
