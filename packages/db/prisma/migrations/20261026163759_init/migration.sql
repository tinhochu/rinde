-- CreateEnum
CREATE TYPE "RetailerSlug" AS ENUM ('exito', 'jumbo', 'd1');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('g', 'ml', 'unit');

-- CreateTable
CREATE TABLE "Retailer" (
    "id" TEXT NOT NULL,
    "slug" "RetailerSlug" NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retailer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "ean" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "size" DECIMAL(12,3),
    "unit" "BaseUnit",
    "isPrivateLabel" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailerProduct" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailerProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "retailerProductId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "listPrice" INTEGER,
    "available" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "ingestRunId" TEXT,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "retailer" "RetailerSlug" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingList" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "budget" INTEGER NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'bogota',
    "rawInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShoppingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "brand" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "BaseUnit" NOT NULL,
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "allowSubstitute" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizedBasket" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "baselineTotal" INTEGER,
    "baselineDescription" TEXT,
    "assumptions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizedBasket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasketItem" (
    "id" TEXT NOT NULL,
    "basketId" TEXT NOT NULL,
    "listItemId" TEXT NOT NULL,
    "priceObservationId" TEXT NOT NULL,
    "packs" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,
    "isSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,

    CONSTRAINT "BasketItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Retailer_slug_key" ON "Retailer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_ean_key" ON "Product"("ean");

-- CreateIndex
CREATE INDEX "RetailerProduct_productId_idx" ON "RetailerProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailerProduct_retailerId_externalId_key" ON "RetailerProduct"("retailerId", "externalId");

-- CreateIndex
CREATE INDEX "PriceObservation_retailerProductId_observedAt_idx" ON "PriceObservation"("retailerProductId", "observedAt" DESC);

-- CreateIndex
CREATE INDEX "ShoppingList_sessionId_idx" ON "ShoppingList"("sessionId");

-- AddForeignKey
ALTER TABLE "RetailerProduct" ADD CONSTRAINT "RetailerProduct_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "Retailer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailerProduct" ADD CONSTRAINT "RetailerProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_retailerProductId_fkey" FOREIGN KEY ("retailerProductId") REFERENCES "RetailerProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_ingestRunId_fkey" FOREIGN KEY ("ingestRunId") REFERENCES "IngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizedBasket" ADD CONSTRAINT "OptimizedBasket_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketItem" ADD CONSTRAINT "BasketItem_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "OptimizedBasket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
