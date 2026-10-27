-- AlterEnum
ALTER TYPE "PriceStatus" ADD VALUE 'reported';

-- AlterTable
ALTER TABLE "PriceObservation" ADD COLUMN     "receiptLineId" TEXT;

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "store" "RetailerSlug" NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "total" INTEGER,
    "invoiceNumber" TEXT NOT NULL,
    "cufe" TEXT,
    "headerFingerprint" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "imagePath" TEXT,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptLine" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'item',
    "text" TEXT NOT NULL,
    "code" TEXT,
    "quantity" DECIMAL(12,3),
    "saleUnit" TEXT,
    "unitPrice" INTEGER,
    "total" INTEGER,
    "priceDerived" BOOLEAN NOT NULL DEFAULT false,
    "check" TEXT NOT NULL,
    "retailerProductId" TEXT,
    "matchedBy" TEXT,
    "produceSlug" TEXT,
    "editedByUser" BOOLEAN NOT NULL DEFAULT false,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "accepted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReceiptLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAlias" (
    "id" TEXT NOT NULL,
    "store" "RetailerSlug" NOT NULL,
    "text" TEXT NOT NULL,
    "retailerProductId" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProduceItem" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "defaultUnit" TEXT NOT NULL,

    CONSTRAINT "ProduceItem_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "accountId" TEXT,
    "displayName" TEXT,
    "zone" TEXT NOT NULL DEFAULT 'Medellín, Antioquia',
    "suspendedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "receiptId" TEXT,
    "receiptLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributorBadge" (
    "contributorId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributorBadge_pkey" PRIMARY KEY ("contributorId","badge")
);

-- CreateTable
CREATE TABLE "DuplicateAttempt" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "matchedReceiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_contributorId_createdAt_idx" ON "Receipt"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_status_createdAt_idx" ON "Receipt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReceiptLine_receiptId_idx" ON "ReceiptLine"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptAlias_store_text_key" ON "ReceiptAlias"("store", "text");

-- CreateIndex
CREATE UNIQUE INDEX "Contributor_sessionId_key" ON "Contributor"("sessionId");

-- CreateIndex
CREATE INDEX "Contributor_accountId_idx" ON "Contributor"("accountId");

-- CreateIndex
CREATE INDEX "RewardEvent_contributorId_createdAt_idx" ON "RewardEvent"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "DuplicateAttempt_contributorId_createdAt_idx" ON "DuplicateAttempt"("contributorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceObservation_receiptLineId_key" ON "PriceObservation"("receiptLineId");

-- CreateIndex
CREATE INDEX "PriceObservation_source_observedAt_idx" ON "PriceObservation"("source", "observedAt");

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "ReceiptLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptLine" ADD CONSTRAINT "ReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_receiptLineId_fkey" FOREIGN KEY ("receiptLineId") REFERENCES "ReceiptLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributorBadge" ADD CONSTRAINT "ContributorBadge_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateAttempt" ADD CONSTRAINT "DuplicateAttempt_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Duplicate guardrail (design D11): a receipt is accepted at most once, by anyone. The indexes cover
-- accepted receipts only (revoked ones too, so they can't be resubmitted) — drafts never block a retake,
-- and when two drafts of the same receipt are confirmed at once, the second commit fails here.
CREATE UNIQUE INDEX "Receipt_accepted_imageHash_key" ON "Receipt" ("imageHash") WHERE "status" IN ('confirmed', 'revoked');
CREATE UNIQUE INDEX "Receipt_accepted_invoice_key" ON "Receipt" ("store", "invoiceNumber") WHERE "status" IN ('confirmed', 'revoked');
CREATE UNIQUE INDEX "Receipt_accepted_cufe_key" ON "Receipt" ("cufe") WHERE "status" IN ('confirmed', 'revoked') AND "cufe" IS NOT NULL;
CREATE UNIQUE INDEX "Receipt_accepted_header_key" ON "Receipt" ("headerFingerprint") WHERE "status" IN ('confirmed', 'revoked');
