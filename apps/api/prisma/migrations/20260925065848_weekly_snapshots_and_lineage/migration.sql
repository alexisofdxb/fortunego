-- AlterTable
ALTER TABLE "weekly_performance" ADD COLUMN     "snapshotId" TEXT;

-- CreateTable
CREATE TABLE "weekly_snapshots" (
    "id" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'finalized',
    "sourceCursors" JSONB NOT NULL DEFAULT '{}',
    "checksums" JSONB NOT NULL DEFAULT '{}',
    "moduleLineage" JSONB NOT NULL DEFAULT '{}',
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "weekly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_snapshots_week_key" ON "weekly_snapshots"("week");
