-- CreateTable
CREATE TABLE "ProductMatch" (
    "id" TEXT NOT NULL,
    "retailerProductId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "by" TEXT NOT NULL,
    "reason" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductMatch_retailerProductId_key" ON "ProductMatch"("retailerProductId");

-- CreateIndex
CREATE INDEX "ProductMatch_fromProductId_idx" ON "ProductMatch"("fromProductId");

-- CreateIndex
CREATE INDEX "ProductMatch_toProductId_idx" ON "ProductMatch"("toProductId");

-- AddForeignKey
ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_retailerProductId_fkey" FOREIGN KEY ("retailerProductId") REFERENCES "RetailerProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMatch" ADD CONSTRAINT "ProductMatch_toProductId_fkey" FOREIGN KEY ("toProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
