-- AlterTable
ALTER TABLE "weekly_performance" ADD COLUMN     "investYieldMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "playerRevenueMinor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "plotgo_visits" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "feeMinor" BIGINT NOT NULL,
    "notionalMinor" BIGINT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "returnedAt" BIGINT,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_investments" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "shareBps" INTEGER NOT NULL,
    "startedDay" TEXT NOT NULL,
    "maturesDay" TEXT NOT NULL,
    "lastPaidDay" TEXT NOT NULL DEFAULT '',
    "yieldPaidMinor" BIGINT NOT NULL DEFAULT 0,
    "owedMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "maturedAt" BIGINT,

    CONSTRAINT "plotgo_investments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_visits_idempotencyKey_key" ON "plotgo_visits"("idempotencyKey");

-- CreateIndex
CREATE INDEX "plotgo_visits_hostId_day_idx" ON "plotgo_visits"("hostId", "day");

-- CreateIndex
CREATE INDEX "plotgo_visits_visitorId_day_idx" ON "plotgo_visits"("visitorId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_visits_visitorId_hostId_day_key" ON "plotgo_visits"("visitorId", "hostId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_investments_idempotencyKey_key" ON "plotgo_investments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "plotgo_investments_hostId_status_idx" ON "plotgo_investments"("hostId", "status");

-- CreateIndex
CREATE INDEX "plotgo_investments_visitorId_status_idx" ON "plotgo_investments"("visitorId", "status");
