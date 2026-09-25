import { z } from "zod";

/**
 * Shared zod DTO schemas for the PlotGo API contract.
 * Web runtime-validates responses with these; api may adopt them later.
 * Mirrors the hand-written `Plot` type that previously lived in apps/web/src/main.ts.
 */

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const orientationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const placedCardSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  orientation: orientationSchema.optional(),
  placedAt: z.number().optional(),
  operationalUntil: z.number().optional(),
});
export type PlacedCardDto = z.infer<typeof placedCardSchema>;

const moduleProfileSchema = z.object({
  buildingRarity: z.string(),
  maxModuleSlots: z.number(),
  slotUnlockLevels: z.array(z.number()),
  allowedCategories: z.array(z.string()),
  maxModuleRarity: z.string(),
  legendaryLimit: z.number(),
});

const huntViewSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  title: z.string(),
  name: z.string(),
  hint: z.string(),
  family: z.string(),
  difficulty: z.string(),
  rewardRarity: z.string(),
  stockTicker: z.string().nullable(),
  rewardValueMinor: z.number(),
  points: z.number(),
  expiresAt: z.number(),
  status: z.string(),
  started: z.boolean().optional(),
  claimed: z.boolean(),
  ready: z.boolean(),
  claimBlockedReason: z.string().nullable(),
  moduleReward: z
    .object({
      kind: z.enum(["module", "parts"]),
      rarity: z.string(),
      quantity: z.number(),
      partsAmount: z.number(),
      compatibleFamily: z.string().nullable(),
      moduleId: z.string().nullable().optional(),
      moduleName: z.string().nullable().optional(),
      label: z.string().optional(),
      rewardId: z.string().optional(),
    })
    .nullable(),
  progress: z.object({ current: z.number(), target: z.number(), done: z.boolean() }),
});

const moduleInventoryViewSchema = z.object({
  moduleId: z.string(),
  name: z.string(),
  rarity: z.string(),
  category: z.string(),
  families: z.array(z.string()),
  primaryPower: z.string(),
  secondaryPower: z.string(),
  condition: z.string(),
  quantityOwned: z.number(),
  quantityEquipped: z.number(),
  quantityAvailable: z.number(),
});

const moduleLoadoutSummarySchema = z.object({
  buildingId: z.string(),
  loadoutVersion: z.number(),
  maxModuleSlots: z.number(),
  unlockedSlots: z.number(),
  slots: z.array(
    z.object({
      slotIndex: z.number(),
      moduleId: z.string(),
      module: z.string(),
      rarity: z.string(),
      effectiveAt: z.number(),
    }),
  ),
});

const receiptSchema = z.object({
  day: z.string(),
  verb: z.string(),
  cashDeltaMinor: z.number(),
  cashAfterMinor: z.number(),
  lines: z.array(z.object({ label: z.string(), amountMinor: z.number() })),
  portfolio: z
    .object({
      applied: z.boolean(),
      marks: z.array(z.object({ ticker: z.string(), returnBps: z.number() })),
      grossMarkMinor: z.number(),
      preFeeAumMinor: z.number(),
      feeMinor: z.number(),
      endAumMinor: z.number(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Snapshot DTO
// ---------------------------------------------------------------------------

export const plotSnapshotSchema = z.object({
  playerId: z.string(),
  cash: z.string(),
  cashMinor: z.number(),
  empireValue: z.string(),
  earnedMinor: z.number(),
  weeklyScore: z.number(),
  weeklyRedeemable: z.boolean(),
  pendingPayout: z.object({ week: z.string(), payoutPlot: z.number() }).nullable(),
  plotBalance: z.number(),
  performance: z.object({
    week: z.string(),
    stage: z.string(),
    score: z.number(),
    eligible: z.boolean(),
    eligibilityReasons: z.array(z.string()),
    components: z.record(z.number()),
    activeDays: z.number(),
    completedHunts: z.number(),
    activityMinor: z.number(),
    revenueMinor: z.number(),
    averageActiveCustomers: z.number(),
    averageUtilization: z.number(),
    finalized: z.boolean(),
    payoutPlot: z.number(),
    claimed: z.boolean(),
  }),
  marketStage: z.string(),
  marketHuntPoints: z.number(),
  marketHuntPointCap: z.number(),
  marketHuntSubscore: z.number(),
  marketHuntPerformanceContribution: z.number(),
  marketPoolConsumption: z.number(),
  presenceState: z.string(),
  activeMinutesToday: z.number(),
  meaningfulActionsToday: z.number(),
  onboarding: z
    .object({
      sessionId: z.string().nullable(),
      startedAt: z.number().nullable(),
      status: z.enum(["active", "completed", "skipped"]),
      step: z.string(),
      xp: z.number(),
      level: z.number(),
      completedAt: z.number().nullable(),
      skippedAt: z.number().nullable(),
      protectionUntil: z.number(),
      recovery: z.object({
        firstCustomerAssistUsed: z.boolean(),
        freeTutorialRelocationUsed: z.boolean(),
      }),
      elapsedMinutes: z.number(),
      guide: z
        .object({
          milestoneId: z.string(),
          title: z.string(),
          prompt: z.string(),
          actionLabel: z.string(),
          target: z.string(),
          recovery: z.string(),
          overdue: z.boolean(),
        })
        .nullable(),
      milestones: z.array(
        z.object({
          id: z.string(),
          targetMinute: z.number(),
          xp: z.number(),
          label: z.string(),
          required: z.boolean(),
          achievedAt: z.number().nullable(),
        }),
      ),
      achieved: z.array(z.string()),
    })
    .nullable(),
  offlineSummary: z
    .object({
      summaryId: z.string(),
      offlineSessionId: z.string(),
      awayStartedAt: z.number(),
      returnedAt: z.number(),
      processedUntil: z.number(),
      frozenMs: z.number(),
      cashDeltaMinor: z.number(),
      customerDelta: z.number(),
      revenueCreditMinor: z.number(),
      growthCredit: z.number(),
      bands: z.array(
        z.object({
          band: z.string(),
          durationMs: z.number(),
          cashEfficiency: z.number(),
          customerIntensity: z.number(),
        }),
      ),
      events: z.array(z.string()),
      risk: z.object({ beforeBps: z.number(), afterBps: z.number() }),
      viewedAt: z.number().nullable(),
    })
    .nullable(),
  stockClaimEligible: z.boolean(),
  stockClaimBlockedReason: z.string().nullable(),
  activeDays: z.number(),
  empireLevel: z.number(),
  tickMinor: z.number(),
  cards: z.array(placedCardSchema),
  catalog: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      era: z.string(),
      lineage: z.string(),
      blurb: z.string(),
      description: z.string(),
      placeCostMinor: z.number(),
      footprint: z.tuple([z.number(), z.number()]),
      progressionFrom: z.string().nullable(),
      moduleProfile: moduleProfileSchema,
      unlocked: z.boolean(),
    }),
  ),
  fragments: z.record(z.number()),
  modules: z
    .object({
      configVersion: z.string(),
      inventory: z.array(moduleInventoryViewSchema),
      parts: z.array(z.object({ rarity: z.string(), balance: z.number() })),
      loadouts: z.array(moduleLoadoutSummarySchema),
    })
    .optional(),
  portfolio: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      sector: z.string(),
      unlockStage: z.string(),
      units: z.number(),
    }),
  ),
  positions: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      sector: z.string(),
      source: z.string(),
      weightBps: z.number(),
      allocatedMinor: z.number(),
      markBps: z.number(),
      lastMarkDay: z.string().nullable(),
      effectiveDay: z.string().nullable(),
      updatedAt: z.number().nullable(),
    }),
  ),
  collections: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      tickers: z.array(z.string()),
      reward: z.string(),
      owned: z.number(),
      total: z.number(),
      complete: z.boolean(),
    }),
  ),
  hunts: z.array(huntViewSchema).optional(),
  hunt: huntViewSchema.nullable(),
  activeHuntCount: z.number().optional(),
  rerollAvailable: z.boolean().optional(),
  huntOffers: z.array(huntViewSchema).optional(),
  objectives: z
    .object({
      day: z.string(),
      rerollAvailable: z.boolean(),
      lanes: z.array(
        z.object({
          lane: z.enum(["operations", "growth", "market"]),
          templateId: z.string(),
          title: z.string(),
          description: z.string(),
          difficulty: z.string(),
          target: z.number(),
          progress: z.object({ current: z.number(), target: z.number(), done: z.boolean() }),
          status: z.string(),
          rewardMinor: z.number(),
          rerolled: z.boolean(),
        }),
      ),
    })
    .optional(),
  eventCalendar: z
    .object({
      week: z.string(),
      current: z
        .object({
          eventId: z.string(),
          title: z.string(),
          startsAt: z.number(),
          endsAt: z.number(),
          durationHours: z.number(),
        })
        .nullable(),
      announced: z.array(
        z.object({
          eventId: z.string(),
          title: z.string(),
          startsAt: z.number(),
          endsAt: z.number(),
          durationHours: z.number(),
        }),
      ),
    })
    .optional(),
  weekStatus: z
    .object({
      week: z.string(),
      status: z.enum(["open", "pending", "finalized"]),
      closesAt: z.number(),
      msUntilClose: z.number(),
      priorWeek: z.object({ week: z.string(), status: z.string() }),
    })
    .optional(),
  operatingStreak: z.number().optional(),
  longestStreak: z.number().optional(),
  notificationsUnread: z.number().optional(),
  event: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    activityBps: z.number(),
    populationBps: z.number(),
    riskDeltaBps: z.number(),
  }),
  marketEvent: z.object({
    id: z.string(),
    title: z.string(),
    durationHours: z.number(),
    spawnMultiplier: z.number(),
    targetMultiplier: z.number(),
    customerDemand: z.number(),
    activityModifier: z.number(),
    stockBias: z.string(),
    minStage: z.string(),
    frequency: z.string(),
  }),
  eventState: z.object({
    cycle: z.object({
      state: z.string(),
      startedAt: z.number(),
      endsAt: z.number(),
      seed: z.number(),
      cycleVersion: z.number(),
    }),
    globalEvent: z.object({
      id: z.string(),
      event: z.string(),
      category: z.string(),
      tone: z.string(),
      minStage: z.string(),
      scope: z.string(),
      durationHours: z.number(),
      demandBps: z.number(),
      activityBps: z.number(),
      revenueBps: z.number(),
      riskBps: z.number(),
      huntSpawnMultiplier: z.number(),
      stockBias: z.string(),
      playerChoice: z.boolean(),
    }),
    globalChoice: z.object({
      id: z.string(),
      catalogId: z.string(),
      choiceId: z.string().nullable(),
      decisions: z.array(
        z.object({
          id: z.string(),
          choice: z.string(),
          immediateCostMinor: z.number(),
          cashRewardMinor: z.number(),
          eventPoints: z.number(),
          tradeoff: z.string(),
        }),
      ),
    }),
    personalEvents: z.array(
      z.object({
        id: z.string(),
        catalogId: z.string(),
        status: z.string(),
        endsAt: z.number(),
        choiceId: z.string().nullable(),
        event: z
          .object({
            id: z.string(),
            event: z.string(),
            category: z.string(),
            tone: z.string(),
            minStage: z.string(),
            scope: z.string(),
            durationHours: z.number(),
            demandBps: z.number(),
            activityBps: z.number(),
            revenueBps: z.number(),
            riskBps: z.number(),
            huntSpawnMultiplier: z.number(),
            stockBias: z.string(),
            playerChoice: z.boolean(),
          })
          .nullable(),
        decisions: z.array(
          z.object({
            id: z.string(),
            choice: z.string(),
            immediateCostMinor: z.number(),
            cashRewardMinor: z.number(),
            eventPoints: z.number(),
            tradeoff: z.string(),
          }),
        ),
      }),
    ),
    mission: z
      .object({
        id: z.string(),
        target: z.number(),
        expiresAt: z.number(),
        status: z.string(),
        template: z
          .object({
            id: z.string(),
            mission: z.string(),
            metric: z.string(),
            cashRewardMinor: z.number(),
            repReward: z.number(),
            eventPoints: z.number(),
          })
          .nullable(),
        progress: z.object({ current: z.number(), target: z.number(), done: z.boolean() }).optional(),
        ready: z.boolean().optional(),
      })
      .nullable(),
    modifiers: z.object({
      demandBps: z.number(),
      activityBps: z.number(),
      revenueBps: z.number(),
      riskBps: z.number(),
      huntSpawnBps: z.number(),
      reputationDelta: z.number(),
    }),
    moduleInteractions: z.object({
      global: z
        .object({
          rewardChance: z.number(),
          rewardRarity: z.string(),
          rewardKind: z.string(),
          rewardOn: z.string(),
          lockFamilies: z.array(z.string()),
          lockReason: z.string().nullable(),
        })
        .nullable(),
      personal: z.array(
        z.object({
          eventId: z.string(),
          interaction: z
            .object({
              rewardChance: z.number(),
              rewardRarity: z.string(),
              rewardKind: z.string(),
              rewardOn: z.string(),
              lockFamilies: z.array(z.string()),
              lockReason: z.string().nullable(),
            })
            .nullable(),
        }),
      ),
    }),
    moduleLocks: z.array(
      z.object({ eventId: z.string(), buildingId: z.string(), family: z.string(), reason: z.string() }),
    ),
    catalogCount: z.number(),
  }),
  placement: z.object({
    directLinks: z.number(),
    supportLinks: z.number(),
    links: z.array(
      z.object({
        id: z.number(),
        rule: z.string(),
        linkType: z.string(),
        distance: z.number(),
        factor: z.number(),
        bonusBps: z.number(),
      }),
    ),
    penalties: z.array(z.object({ kind: z.string(), bps: z.number(), message: z.string() })),
    districts: z.array(z.object({ id: z.string(), name: z.string() })),
    score: z.object({
      placementScore: z.number(),
      synergyCoverage: z.number(),
      infrastructureCoverage: z.number(),
      congestionHealth: z.number(),
      spaceEfficiency: z.number(),
      diversification: z.number(),
    }),
  }),
  placementAudit: z.object({
    layoutVersion: z.number(),
    geometryHash: z.string(),
    synergyVersion: z.number(),
    supportVersion: z.number(),
    stackVersion: z.number(),
    congestionVersion: z.number(),
    districtVersion: z.number(),
    tilemapVersion: z.number(),
    diagnosticVersion: z.number(),
    moveTxId: z.string().nullable(),
  }),
  session: z.object({ verb: z.string(), settledAt: z.number(), receipt: receiptSchema }).nullable(),
  attributes: z.object({
    riskBps: z.number(),
    reputationBps: z.number(),
    conditionBps: z.number(),
    population: z.number(),
    capacity: z.number(),
    satisfactionBps: z.number(),
    segments: z.object({
      generalConsumers: z.number(),
      retailInvestors: z.number(),
      activeTraders: z.number(),
      smallBusinesses: z.number(),
      corporateClients: z.number(),
      highNetWorth: z.number(),
      institutional: z.number(),
    }),
    transactions: z.number(),
    volumeMinor: z.number(),
    synergyCount: z.number(),
    revenue: z.array(
      z.object({
        buildingId: z.string(),
        buildingName: z.string(),
        model: z.string(),
        amountMinor: z.number(),
      }),
    ),
  }),
  dropped: z.string().nullable().optional(),
});
export type PlotSnapshot = z.infer<typeof plotSnapshotSchema>;
export type HuntView = z.infer<typeof huntViewSchema>;
export type ModuleInventoryView = z.infer<typeof moduleInventoryViewSchema>;
export type ModuleLoadoutSummary = z.infer<typeof moduleLoadoutSummarySchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type CatalogEntry = PlotSnapshot["catalog"][number];

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const sessionStartSchema = z.object({ playerId: z.string().optional() });
export type SessionStartRequest = z.infer<typeof sessionStartSchema>;

export const placeRequestSchema = z.object({
  type: z.string(),
  x: z.number(),
  y: z.number(),
  orientation: orientationSchema.default(0),
});
export type PlaceRequest = z.infer<typeof placeRequestSchema>;

export const moveRequestSchema = z.object({
  cardId: z.string(),
  x: z.number(),
  y: z.number(),
  orientation: orientationSchema.default(0),
});
export type MoveRequest = z.infer<typeof moveRequestSchema>;

export const rotateRequestSchema = z.object({ cardId: z.string(), orientation: orientationSchema });
export type RotateRequest = z.infer<typeof rotateRequestSchema>;

export const upgradeRequestSchema = z.object({ cardId: z.string() });
export type UpgradeRequest = z.infer<typeof upgradeRequestSchema>;

export const huntClaimRequestSchema = z.object({ huntId: z.string().optional() });
export type HuntClaimRequest = z.infer<typeof huntClaimRequestSchema>;

export const moduleEquipRequestSchema = z.object({
  slot: z.number(),
  moduleId: z.string(),
  idempotencyKey: z.string(),
});
export type ModuleEquipRequest = z.infer<typeof moduleEquipRequestSchema>;

export const moduleUnequipRequestSchema = z.object({
  slot: z.number(),
  idempotencyKey: z.string(),
});
export type ModuleUnequipRequest = z.infer<typeof moduleUnequipRequestSchema>;

export const performanceClaimRequestSchema = z.object({ week: z.string().optional() });
export type PerformanceClaimRequest = z.infer<typeof performanceClaimRequestSchema>;

export const eventChooseRequestSchema = z.object({ eventId: z.string(), decisionId: z.string() });
export type EventChooseRequest = z.infer<typeof eventChooseRequestSchema>;

export const eventMissionClaimRequestSchema = z.object({ missionId: z.string().optional() });
export type EventMissionClaimRequest = z.infer<typeof eventMissionClaimRequestSchema>;

export const sessionSettleRequestSchema = z.object({ verb: z.string() });
export type SessionSettleRequest = z.infer<typeof sessionSettleRequestSchema>;

export const positionsRebalanceRequestSchema = z.object({
  weights: z.record(z.number()),
});
export type PositionsRebalanceRequest = z.infer<typeof positionsRebalanceRequestSchema>;

export const offlineSummaryViewRequestSchema = z.object({ summaryId: z.string().optional() });
export type OfflineSummaryViewRequest = z.infer<typeof offlineSummaryViewRequestSchema>;

// ---------------------------------------------------------------------------
// Retention loop — daily briefing / hunts / objectives / notifications
// ---------------------------------------------------------------------------

export const huntStartRequestSchema = z.object({ huntId: z.string() });
export type HuntStartRequest = z.infer<typeof huntStartRequestSchema>;

export const huntRerollRequestSchema = z.object({ huntId: z.string().optional() });
export type HuntRerollRequest = z.infer<typeof huntRerollRequestSchema>;

export const objectiveRerollRequestSchema = z.object({
  lane: z.enum(["operations", "growth", "market"]),
});
export type ObjectiveRerollRequest = z.infer<typeof objectiveRerollRequestSchema>;

/** In-app notification inbox item (backend NotificationView, newest first). */
export const notificationViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  dedupeKey: z.string(),
  payload: z.record(z.unknown()),
  state: z.string(),
  eligibleAt: z.number(),
  createdAt: z.number(),
});
export type NotificationView = z.infer<typeof notificationViewSchema>;

export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationViewSchema),
  unread: z.number(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

// ---------------------------------------------------------------------------
// Response wrappers
// ---------------------------------------------------------------------------

export const sessionStartResponseSchema = z.object({
  playerId: z.string(),
  plot: plotSnapshotSchema,
});
export type SessionStartResponse = z.infer<typeof sessionStartResponseSchema>;

export const rebalanceResponseSchema = z.object({
  receipt: z.object({ effectiveDay: z.string() }),
});
export type RebalanceResponse = z.infer<typeof rebalanceResponseSchema>;

export const claimedPlotResponseSchema = plotSnapshotSchema.extend({
  claimedPlot: z.number().optional(),
});
export type ClaimedPlotResponse = z.infer<typeof claimedPlotResponseSchema>;

// ---------------------------------------------------------------------------
// Phase 5 — visits + visitor investment
// ---------------------------------------------------------------------------

export const visitActionSchema = z.enum(["trade", "deposit", "borrow"]);
export type VisitActionDto = z.infer<typeof visitActionSchema>;

export const visitRequestSchema = z.object({
  hostId: z.string(),
  action: visitActionSchema,
  buildingId: z.string(),
  idempotencyKey: z.string(),
});
export type VisitRequest = z.infer<typeof visitRequestSchema>;

export const visitReceiptSchema = z.object({
  visitId: z.string(),
  day: z.string(),
  action: z.string(),
  hostId: z.string(),
  buildingId: z.string(),
  feeMinor: z.number(),
  notionalMinor: z.number(),
  replayed: z.boolean(),
});
export type VisitReceipt = z.infer<typeof visitReceiptSchema>;

export const investRequestSchema = z.object({
  hostId: z.string(),
  buildingId: z.string(),
  amountMinor: z.number().int(),
  idempotencyKey: z.string(),
});
export type InvestRequest = z.infer<typeof investRequestSchema>;

export const investReceiptSchema = z.object({
  investmentId: z.string(),
  day: z.string(),
  hostId: z.string(),
  buildingId: z.string(),
  amountMinor: z.number(),
  shareBps: z.number(),
  startedDay: z.string(),
  maturesDay: z.string(),
  replayed: z.boolean(),
});
export type InvestReceipt = z.infer<typeof investReceiptSchema>;

export const playerBoardSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  archetype: z.string().nullable(),
  empireLevel: z.number(),
  buildings: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      x: z.number(),
      y: z.number(),
      stage: z.number(),
      orientation: z.number(),
      lineage: z.string(),
      color: z.string(),
    }),
  ),
});
export type PlayerBoard = z.infer<typeof playerBoardSchema>;

export const investmentViewSchema = z.object({
  investmentId: z.string(),
  hostId: z.string().optional(),
  hostName: z.string().optional(),
  visitorId: z.string().optional(),
  visitorName: z.string().optional(),
  buildingId: z.string(),
  building: z.object({ type: z.string(), name: z.string() }).nullable(),
  amountMinor: z.number(),
  shareBps: z.number(),
  startedDay: z.string().optional(),
  maturesDay: z.string(),
  daysRemaining: z.number().optional(),
  yieldPaidMinor: z.number(),
  owedMinor: z.number(),
  status: z.string(),
});
export type InvestmentView = z.infer<typeof investmentViewSchema>;

export const investmentsViewSchema = z.object({
  asVisitor: z.array(investmentViewSchema),
  asHost: z.array(investmentViewSchema),
});
export type InvestmentsView = z.infer<typeof investmentsViewSchema>;

export const leaderboardEntrySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  archetype: z.string().nullable(),
  founder: z.boolean(),
  empireValue: z.string().optional(),
  empireValueMinor: z.number().optional(),
  cash7dMinor: z.number().optional(),
  reputationBps: z.number().optional(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardResponseSchema = z.object({
  kind: z.string(),
  board: z.array(leaderboardEntrySchema),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
