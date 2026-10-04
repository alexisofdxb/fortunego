-- LiveOps earned cases (Daily / Business / Market) + pity counters

CREATE TABLE "liveops_cases" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "caseType" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "openedAt" BIGINT NOT NULL,
    "lootTableVersion" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "pityAfter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "liveops_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_liveops_case_open" ON "liveops_cases"("playerId", "caseType", "sourceEventId");
CREATE INDEX "liveops_cases_playerId_idx" ON "liveops_cases"("playerId");

CREATE TABLE "liveops_pity" (
    "playerId" TEXT NOT NULL,
    "caseFamily" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "liveops_pity_pkey" PRIMARY KEY ("playerId","caseFamily")
);
