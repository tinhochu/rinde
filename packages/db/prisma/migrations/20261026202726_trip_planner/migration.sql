/*
  Warnings:

  - You are about to drop the column `explanation` on the `BasketItem` table. All the data in the column will be lost.
  - Added the required column `observedAt` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priceStatus` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reason` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `retailer` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `retailerProductId` to the `BasketItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `alternatives` to the `OptimizedBasket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `budget` to the `OptimizedBasket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stops` to the `OptimizedBasket` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tripCost` to the `OptimizedBasket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PriceStatus" AS ENUM ('live', 'snapshot');

-- AlterTable
ALTER TABLE "BasketItem" DROP COLUMN "explanation",
ADD COLUMN     "observedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "price" INTEGER NOT NULL,
ADD COLUMN     "priceStatus" "PriceStatus" NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "retailer" "RetailerSlug" NOT NULL,
ADD COLUMN     "retailerProductId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OptimizedBasket" ADD COLUMN     "alternatives" JSONB NOT NULL,
ADD COLUMN     "budget" INTEGER NOT NULL,
ADD COLUMN     "overBudget" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "savings" INTEGER,
ADD COLUMN     "stops" INTEGER NOT NULL,
ADD COLUMN     "stores" "RetailerSlug"[],
ADD COLUMN     "tripCost" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "ShoppingList" ADD COLUMN     "forceStores" "RetailerSlug"[] DEFAULT ARRAY[]::"RetailerSlug"[],
ADD COLUMN     "tripCost" INTEGER NOT NULL DEFAULT 10000;

-- AlterTable
ALTER TABLE "ShoppingListItem" ADD COLUMN     "dropped" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedListingId" TEXT;

-- CreateTable
CREATE TABLE "TradeoffDecision" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "proposalKey" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeoffDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeoffDecision_listId_proposalKey_key" ON "TradeoffDecision"("listId", "proposalKey");

-- AddForeignKey
ALTER TABLE "TradeoffDecision" ADD CONSTRAINT "TradeoffDecision_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ShoppingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
