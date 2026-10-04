-- Season pass + pass claim ledger (LiveOps Phase 4)

CREATE TABLE "liveops_season_pass" (
    "playerId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_season_pass_pkey" PRIMARY KEY ("playerId","seasonId")
);

CREATE INDEX "liveops_season_pass_playerId_idx" ON "liveops_season_pass"("playerId");

CREATE TABLE "liveops_pass_claims" (
    "playerId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "track" TEXT NOT NULL,
    "claimedAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_pass_claims_pkey" PRIMARY KEY ("playerId","seasonId","level","track")
);

CREATE INDEX "liveops_pass_claims_playerId_idx" ON "liveops_pass_claims"("playerId");
