-- AlterTable
ALTER TABLE "market_hunt_slots" ADD COLUMN     "started" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "operatingStreak" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "weekly_snapshots" ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "player_daily_state" (
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "engagedMinutes" INTEGER NOT NULL DEFAULT 0,
    "meaningfulActions" INTEGER NOT NULL DEFAULT 0,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "huntOfferSet" BOOLEAN NOT NULL DEFAULT false,
    "huntRerolled" BOOLEAN NOT NULL DEFAULT false,
    "objectiveSet" BOOLEAN NOT NULL DEFAULT false,
    "objectiveRerolled" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" BIGINT,

    CONSTRAINT "player_daily_state_pkey" PRIMARY KEY ("playerId","day")
);

-- CreateTable
CREATE TABLE "plotgo_objective_state" (
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "targetJson" JSONB NOT NULL,
    "progressJson" JSONB NOT NULL DEFAULT '{}',
    "evidenceCursor" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "rewardMinor" BIGINT NOT NULL DEFAULT 0,
    "rerolled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_objective_state_pkey" PRIMARY KEY ("playerId","day","lane")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL DEFAULT '{}',
    "eligibleAt" BIGINT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_job_checkpoints" (
    "jobId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_job_checkpoints_pkey" PRIMARY KEY ("jobId")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_outbox_playerId_state_idx" ON "notification_outbox"("playerId", "state");
