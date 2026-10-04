-- LiveOps item bag + idempotent grant audit
-- (Fortune_Go_LiveOps_Events_Gacha_Packs_Design_v1.0 Phase 0)

CREATE TABLE "player_liveops_items" (
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "player_liveops_items_pkey" PRIMARY KEY ("playerId","itemId")
);

CREATE INDEX "player_liveops_items_playerId_idx" ON "player_liveops_items"("playerId");

CREATE TABLE "liveops_grant_events" (
    "grantId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_grant_events_pkey" PRIMARY KEY ("grantId")
);

CREATE UNIQUE INDEX "idx_liveops_grant_source" ON "liveops_grant_events"("playerId", "source", "sourceEventId", "itemId");
CREATE INDEX "liveops_grant_events_playerId_idx" ON "liveops_grant_events"("playerId");
