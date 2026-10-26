-- AlterTable
ALTER TABLE "PriceObservation" ADD COLUMN     "stock" INTEGER;

-- Accent-insensitive product search ("cafe" matches "Café")
CREATE EXTENSION IF NOT EXISTS unaccent;
