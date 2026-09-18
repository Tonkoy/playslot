-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "bookingDurationsMin" INTEGER[] DEFAULT ARRAY[60, 90, 120]::INTEGER[];
