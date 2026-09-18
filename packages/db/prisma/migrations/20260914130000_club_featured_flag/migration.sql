-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Club_isFeatured_idx" ON "Club"("isFeatured");
