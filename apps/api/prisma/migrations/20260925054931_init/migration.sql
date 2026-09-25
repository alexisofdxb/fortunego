-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "founder" BOOLEAN NOT NULL DEFAULT true,
    "cashMinor" BIGINT NOT NULL,
    "earnedMinor" BIGINT NOT NULL DEFAULT 0,
    "lastSettleAt" BIGINT NOT NULL,
    "exchangeActionsToday" INTEGER NOT NULL DEFAULT 0,
    "huntDay" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "huntClaimed" BOOLEAN NOT NULL DEFAULT false,
    "weeklyScore" INTEGER NOT NULL DEFAULT 0,
    "riskBps" INTEGER NOT NULL DEFAULT 700,
    "reputationBps" INTEGER NOT NULL DEFAULT 5000,
    "conditionBps" INTEGER NOT NULL DEFAULT 10000,
    "population" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "satisfactionBps" INTEGER NOT NULL DEFAULT 5000,
    "transactions" INTEGER NOT NULL DEFAULT 0,
    "volumeMinor" BIGINT NOT NULL DEFAULT 0,
    "activeDays" JSONB NOT NULL DEFAULT '[]',
    "plotBalance" BIGINT NOT NULL DEFAULT 0,
    "lastMeaningfulActionAt" BIGINT NOT NULL DEFAULT 0,
    "offlineStartedAt" BIGINT NOT NULL DEFAULT 0,
    "offlineProcessedUntil" BIGINT NOT NULL DEFAULT 0,
    "presenceState" TEXT NOT NULL DEFAULT 'engaged',
    "offlineSessionId" TEXT,
    "activeMinutesDailyJson" JSONB NOT NULL DEFAULT '{}',
    "meaningfulActionsDailyJson" JSONB NOT NULL DEFAULT '{}',
    "onboardingSessionId" TEXT,
    "onboardingStartedAt" BIGINT,
    "onboardingStep" TEXT NOT NULL DEFAULT 'welcome',
    "onboardingStatus" TEXT NOT NULL DEFAULT 'active',
    "onboardingXp" INTEGER NOT NULL DEFAULT 0,
    "onboardingCompletedAt" BIGINT,
    "onboardingSkippedAt" BIGINT,
    "firstCustomerAssistUsed" BOOLEAN NOT NULL DEFAULT false,
    "freeTutorialRelocationUsed" BOOLEAN NOT NULL DEFAULT false,
    "personalEventProtectionUntil" BIGINT NOT NULL DEFAULT 0,
    "archetype" TEXT,
    "archetypeChangedAt" BIGINT,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_onboarding_milestones" (
    "playerId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "sourceEvent" TEXT NOT NULL,
    "achievedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_onboarding_milestones_pkey" PRIMARY KEY ("playerId","milestoneId")
);

-- CreateTable
CREATE TABLE "plotgo_tutorial_recovery_ledger" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "creditedMinor" BIGINT NOT NULL DEFAULT 0,
    "sourceEvent" TEXT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_tutorial_recovery_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "orientation" INTEGER NOT NULL DEFAULT 0,
    "placedAt" BIGINT NOT NULL DEFAULT 0,
    "operationalUntil" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fragments" (
    "playerId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "unitsBps" INTEGER NOT NULL,
    "unitsMicros" BIGINT,

    CONSTRAINT "fragments_pkey" PRIMARY KEY ("playerId","ticker")
);

-- CreateTable
CREATE TABLE "plotgo_position" (
    "playerId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "weightBps" INTEGER NOT NULL DEFAULT 0,
    "allocatedMinor" BIGINT NOT NULL DEFAULT 0,
    "markBps" INTEGER NOT NULL DEFAULT 0,
    "lastMarkDay" TEXT NOT NULL DEFAULT '',
    "effectiveDay" TEXT NOT NULL DEFAULT '',
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_position_pkey" PRIMARY KEY ("playerId","ticker")
);

-- CreateTable
CREATE TABLE "market_reward_pool" (
    "week" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "allocatedMinor" BIGINT NOT NULL,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,
    "claimedMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "market_reward_pool_pkey" PRIMARY KEY ("week","ticker")
);

-- CreateTable
CREATE TABLE "market_hunt_slots" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "issuedDay" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "rewardRarity" TEXT NOT NULL,
    "stockTicker" TEXT,
    "rewardValueMinor" BIGINT NOT NULL DEFAULT 0,
    "moduleRewardKind" TEXT,
    "moduleRewardRarity" TEXT,
    "moduleRewardQuantity" INTEGER NOT NULL DEFAULT 0,
    "moduleRewardParts" INTEGER NOT NULL DEFAULT 0,
    "moduleRewardModuleId" TEXT,
    "points" INTEGER NOT NULL,
    "target" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "issuedAt" BIGINT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "claimedAt" BIGINT,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "market_hunt_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_oracle_prices" (
    "ticker" TEXT NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "refreshedAt" BIGINT NOT NULL,

    CONSTRAINT "market_oracle_prices_pkey" PRIMARY KEY ("ticker")
);

-- CreateTable
CREATE TABLE "weekly_performance" (
    "playerId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "activeDays" INTEGER NOT NULL DEFAULT 0,
    "activityMinor" BIGINT NOT NULL DEFAULT 0,
    "revenueMinor" BIGINT NOT NULL DEFAULT 0,
    "activeCustomersTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customerSamples" INTEGER NOT NULL DEFAULT 0,
    "newRetainedCustomers" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "utilizationBpsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reputationBpsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskBpsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eventPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "huntsCompleted" INTEGER NOT NULL DEFAULT 0,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "payoutPlot" BIGINT NOT NULL DEFAULT 0,
    "claimedAt" BIGINT,
    "finalizedAt" BIGINT,

    CONSTRAINT "weekly_performance_pkey" PRIMARY KEY ("playerId","week")
);

-- CreateTable
CREATE TABLE "plotgo_ledger" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceMinor" BIGINT NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_district_day" (
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "marksJson" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "plotgo_district_day_pkey" PRIMARY KEY ("playerId","day")
);

-- CreateTable
CREATE TABLE "plotgo_session" (
    "playerId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "verb" TEXT NOT NULL,
    "receiptJson" JSONB NOT NULL,
    "settledAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_session_pkey" PRIMARY KEY ("playerId","day")
);

-- CreateTable
CREATE TABLE "plotgo_placement_audit" (
    "playerId" TEXT NOT NULL,
    "layoutVersion" INTEGER NOT NULL DEFAULT 0,
    "geometryHash" TEXT NOT NULL,
    "synergyVersion" INTEGER NOT NULL DEFAULT 1,
    "supportVersion" INTEGER NOT NULL DEFAULT 1,
    "stackVersion" INTEGER NOT NULL DEFAULT 1,
    "congestionVersion" INTEGER NOT NULL DEFAULT 1,
    "districtVersion" INTEGER NOT NULL DEFAULT 1,
    "tilemapVersion" INTEGER NOT NULL DEFAULT 1,
    "diagnosticVersion" INTEGER NOT NULL DEFAULT 1,
    "moveTxId" TEXT,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_placement_audit_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "plotgo_market_cycle" (
    "id" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "startedAt" BIGINT NOT NULL,
    "endsAt" BIGINT NOT NULL,
    "seed" INTEGER NOT NULL,
    "cycleVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_market_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_player_events" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "issuedAt" BIGINT NOT NULL,
    "startsAt" BIGINT NOT NULL,
    "endsAt" BIGINT NOT NULL,
    "choiceId" TEXT,
    "resolutionJson" JSONB,
    "resolvedAt" BIGINT,
    "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plotgo_player_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_event_missions" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "issuedAt" BIGINT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "claimedAt" BIGINT,
    "rewardClaimed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "plotgo_event_missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_event_audit" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "eventId" TEXT,
    "auditType" TEXT NOT NULL,
    "resolutionHash" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_event_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plotgo_module_reward_events" (
    "rewardId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "rewardKind" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "moduleId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "partsAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "configVersion" TEXT NOT NULL DEFAULT 'catalog-v1.0',
    "createdAt" BIGINT NOT NULL,
    "claimedAt" BIGINT,

    CONSTRAINT "plotgo_module_reward_events_pkey" PRIMARY KEY ("rewardId")
);

-- CreateTable
CREATE TABLE "module_config" (
    "moduleId" TEXT NOT NULL,
    "configVersion" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "compatibleFamilies" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" BIGINT NOT NULL,
    "effectiveUntil" BIGINT,

    CONSTRAINT "module_config_pkey" PRIMARY KEY ("moduleId","configVersion")
);

-- CreateTable
CREATE TABLE "player_module_inventory" (
    "playerId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "quantityOwned" INTEGER NOT NULL DEFAULT 0,
    "quantityEquipped" INTEGER NOT NULL DEFAULT 0,
    "firstAcquiredAt" BIGINT NOT NULL,
    "lastAcquiredAt" BIGINT NOT NULL,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "player_module_inventory_pkey" PRIMARY KEY ("playerId","moduleId")
);

-- CreateTable
CREATE TABLE "building_module_loadout" (
    "playerId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "moduleId" TEXT NOT NULL,
    "effectiveAt" BIGINT NOT NULL,
    "loadoutVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "building_module_loadout_pkey" PRIMARY KEY ("playerId","buildingId","slotIndex")
);

-- CreateTable
CREATE TABLE "module_loadout_audit" (
    "eventId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "moduleId" TEXT,
    "action" TEXT NOT NULL,
    "effectiveAt" BIGINT NOT NULL,
    "loadoutVersion" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "module_loadout_audit_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "building_mastery_progress" (
    "playerId" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "progressJson" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" BIGINT,
    "claimedAt" BIGINT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "building_mastery_progress_pkey" PRIMARY KEY ("playerId","buildingType","tier")
);

-- CreateTable
CREATE TABLE "module_parts_balance" (
    "playerId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "module_parts_balance_pkey" PRIMARY KEY ("playerId","rarity")
);

-- CreateTable
CREATE TABLE "module_parts_ledger" (
    "entryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "delta" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "module_parts_ledger_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "module_craft_jobs" (
    "craftId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "partsCost" BIGINT NOT NULL,
    "startedAt" BIGINT NOT NULL,
    "completesAt" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" BIGINT NOT NULL,
    "completedAt" BIGINT,

    CONSTRAINT "module_craft_jobs_pkey" PRIMARY KEY ("craftId")
);

-- CreateTable
CREATE TABLE "plotgo_offline_sessions" (
    "offlineSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "startedAt" BIGINT NOT NULL,
    "processedFrom" BIGINT NOT NULL,
    "processedUntil" BIGINT NOT NULL,
    "capUntil" BIGINT NOT NULL,
    "presenceState" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "configVersion" TEXT NOT NULL,
    "summaryJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" BIGINT NOT NULL,
    "completedAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_offline_sessions_pkey" PRIMARY KEY ("offlineSessionId")
);

-- CreateTable
CREATE TABLE "plotgo_offline_buckets" (
    "bucketId" TEXT NOT NULL,
    "offlineSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "startAt" BIGINT NOT NULL,
    "endAt" BIGINT NOT NULL,
    "band" TEXT NOT NULL,
    "presenceState" TEXT NOT NULL,
    "cashEfficiency" DOUBLE PRECISION NOT NULL,
    "customerIntensity" DOUBLE PRECISION NOT NULL,
    "cashDeltaMinor" BIGINT NOT NULL DEFAULT 0,
    "customerDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performanceRevenueCreditMinor" BIGINT NOT NULL DEFAULT 0,
    "performanceGrowthCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskBeforeBps" INTEGER NOT NULL DEFAULT 0,
    "riskAfterBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_offline_buckets_pkey" PRIMARY KEY ("bucketId")
);

-- CreateTable
CREATE TABLE "plotgo_offline_summaries" (
    "summaryId" TEXT NOT NULL,
    "offlineSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "awayStartedAt" BIGINT NOT NULL,
    "returnedAt" BIGINT NOT NULL,
    "processedUntil" BIGINT NOT NULL,
    "frozenMs" BIGINT NOT NULL DEFAULT 0,
    "cashDeltaMinor" BIGINT NOT NULL DEFAULT 0,
    "customerDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueCreditMinor" BIGINT NOT NULL DEFAULT 0,
    "growthCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandsJson" JSONB NOT NULL DEFAULT '[]',
    "timersJson" JSONB NOT NULL DEFAULT '[]',
    "eventsJson" JSONB NOT NULL DEFAULT '[]',
    "riskJson" JSONB NOT NULL DEFAULT '{}',
    "viewedAt" BIGINT,
    "createdAt" BIGINT NOT NULL,

    CONSTRAINT "plotgo_offline_summaries_pkey" PRIMARY KEY ("summaryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_tutorial_recovery_ledger_playerId_kind_key" ON "plotgo_tutorial_recovery_ledger"("playerId", "kind");

-- CreateIndex
CREATE INDEX "cards_playerId_idx" ON "cards"("playerId");

-- CreateIndex
CREATE INDEX "market_hunt_slots_playerId_issuedDay_idx" ON "market_hunt_slots"("playerId", "issuedDay");

-- CreateIndex
CREATE INDEX "plotgo_player_events_playerId_idx" ON "plotgo_player_events"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_module_reward_events_playerId_source_sourceEventId_key" ON "plotgo_module_reward_events"("playerId", "source", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "module_loadout_audit_playerId_buildingId_idempotencyKey_key" ON "module_loadout_audit"("playerId", "buildingId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "module_parts_ledger_playerId_source_sourceEventId_key" ON "module_parts_ledger"("playerId", "source", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_offline_buckets_playerId_startAt_endAt_key" ON "plotgo_offline_buckets"("playerId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "plotgo_offline_summaries_offlineSessionId_key" ON "plotgo_offline_summaries"("offlineSessionId");
