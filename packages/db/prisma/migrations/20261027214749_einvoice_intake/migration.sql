-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "dianConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'photo',
ADD COLUMN     "tolerance" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ForwardingAddress" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "emailsToday" INTEGER NOT NULL DEFAULT 0,
    "countedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardingAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceIntake" (
    "id" TEXT NOT NULL,
    "contributorId" TEXT,
    "addressId" TEXT,
    "via" TEXT NOT NULL,
    "resendEmailId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "message" TEXT,
    "receiptId" TEXT,
    "results" JSONB,
    "fileHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "store" "RetailerSlug",
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForwardingAddress_token_key" ON "ForwardingAddress"("token");

-- CreateIndex
CREATE INDEX "ForwardingAddress_contributorId_idx" ON "ForwardingAddress"("contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceIntake_resendEmailId_key" ON "InvoiceIntake"("resendEmailId");

-- CreateIndex
CREATE INDEX "InvoiceIntake_contributorId_createdAt_idx" ON "InvoiceIntake"("contributorId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceIntake_status_createdAt_idx" ON "InvoiceIntake"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ForwardingAddress" ADD CONSTRAINT "ForwardingAddress_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIntake" ADD CONSTRAINT "InvoiceIntake_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIntake" ADD CONSTRAINT "InvoiceIntake_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "ForwardingAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
