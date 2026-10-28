-- CreateTable
CREATE TABLE "StoreBranch" (
    "id" TEXT NOT NULL,
    "chain" "RetailerSlug" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "area" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "osmId" TEXT NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreBranch_osmId_key" ON "StoreBranch"("osmId");

-- CreateIndex
CREATE INDEX "StoreBranch_chain_idx" ON "StoreBranch"("chain");

-- CreateIndex
CREATE INDEX "StoreBranch_lat_lon_idx" ON "StoreBranch"("lat", "lon");
