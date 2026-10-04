-- LiveOps shop quotes + purchase ledger (Phase 5)

CREATE TABLE "liveops_shop_quotes" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "usdRef" DOUBLE PRECISION NOT NULL,
    "plotPrice" INTEGER NOT NULL,
    "refPlotUsd" DOUBLE PRECISION NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_shop_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liveops_shop_quotes_playerId_sku_idx" ON "liveops_shop_quotes"("playerId", "sku");

CREATE TABLE "liveops_shop_purchases" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "plotPaid" INTEGER NOT NULL DEFAULT 0,
    "cashMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_shop_purchases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liveops_shop_purchases_playerId_sku_period_idx" ON "liveops_shop_purchases"("playerId", "sku", "period");
