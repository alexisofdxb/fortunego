-- AlterTable
ALTER TABLE "players" ADD COLUMN     "acquisitionBoostUntil" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "customerSegments" JSONB;
