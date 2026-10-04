-- LiveOps campaign scores + milestone claims (Phase 1)

CREATE TABLE "liveops_campaign_scores" (
    "playerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "lastActionAt" BIGINT NOT NULL,
    "dailyJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "liveops_campaign_scores_pkey" PRIMARY KEY ("playerId","eventId","seasonId")
);

CREATE INDEX "liveops_campaign_scores_playerId_idx" ON "liveops_campaign_scores"("playerId");

CREATE TABLE "liveops_milestone_claims" (
    "playerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "claimedAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_milestone_claims_pkey" PRIMARY KEY ("playerId","eventId","seasonId","milestoneId")
);

CREATE INDEX "liveops_milestone_claims_playerId_idx" ON "liveops_milestone_claims"("playerId");
