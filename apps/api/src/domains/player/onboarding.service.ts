import {
  STARTER_HEX_ID,
  STARTER_CASH_MINOR,
  clampLevel,
  onboardingGuideFor,
  onboardingLevel as onboardingLevelForXp,
  onboardingMilestone,
  onboardingStep as onboardingStepForMilestones,
  resolvePlacement,
  ONBOARDING_MILESTONES,
  parcelForHex,
  utcDay,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";
import { ensureOpeningLedger } from "../economy/ledger.service";
import { grantModuleInventory } from "../modules/modules.service";
import { awardLand } from "./empire.service";
import { assignWorldRegion } from "../world/world.service";

/**
 * Create a fresh player account (starter Cash, new-player acquisition boost
 * window, opening ledger, onboarding kickoff). Used by the dev-mode session
 * route and by privy-mode first login. Races are safe: callers either hold a
 * unique key (privyUserId) or pre-check existence (dev mode).
 */
export async function createPlayer(account: { id?: string; privyUserId?: string }) {
  const id = account.id ?? newId();
  const now = Date.now();
  await prisma.player.create({
    data: {
      id,
      privyUserId: account.privyUserId ?? null,
      createdAt: now,
      founder: true,
      cashMinor: STARTER_CASH_MINOR,
      earnedMinor: 0,
      lastSettleAt: now,
      exchangeActionsToday: 0,
      huntDay: utcDay(),
      huntId: "upgrade_any",
      huntClaimed: false,
      weeklyScore: 0,
      riskBps: 700,
      reputationBps: 5000,
      conditionBps: 10000,
      population: 0,
      capacity: 0,
      satisfactionBps: 5000,
      transactions: 0,
      volumeMinor: 0,
      // v0.2: the customer-simulation acquisition boost is retired (settle no
      // longer reads this column); kept at 0 for schema compatibility.
      acquisitionBoostUntil: 0,
      empireLevel: 1,
      empireXp: 0,
      lastMeaningfulActionAt: now,
      offlineStartedAt: now,
      offlineProcessedUntil: now,
      presenceState: "engaged",
    },
  });
  // v0.2 bootstrap: the starter parcel (hex 35 = parcel D05) is granted at
  // creation so a fresh account can place its first building immediately.
  await prisma.plotgoLand.create({
    data: { id: newId(), playerId: id, hexId: STARTER_HEX_ID, method: "starter_grant", priceMinor: 0, acquiredAt: now },
  });
  await ensureOpeningLedger(prisma, id, STARTER_CASH_MINOR);
  // v1.0: the bootstrap grant counts as a land acquisition (75 × Entry = 75 XP).
  await awardLand(id, parcelForHex(STARTER_HEX_ID) ?? "D05");
  // Starter gift: one common module so the first-time tutorial can teach
  // equipping without depending on random hunt drops.
  await grantModuleInventory(prisma, id, "mod_customer_signage", 1);
  await assignWorldRegion(id);
  return prisma.player.findUniqueOrThrow({ where: { id } });
}

export type OnboardingRow = {
  onboardingSessionId: string | null;
  onboardingStartedAt: number | null;
  onboardingStep: string;
  onboardingStatus: "active" | "completed" | "skipped";
  onboardingXp: number;
  onboardingCompletedAt: number | null;
  onboardingSkippedAt: number | null;
  personalEventProtectionUntil: number;
  firstCustomerAssistUsed: number;
  freeTutorialRelocationUsed: number;
};

export async function onboardingRow(playerId: string): Promise<OnboardingRow | undefined> {
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      onboardingSessionId: true,
      onboardingStartedAt: true,
      onboardingStep: true,
      onboardingStatus: true,
      onboardingXp: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
      personalEventProtectionUntil: true,
      firstCustomerAssistUsed: true,
      freeTutorialRelocationUsed: true,
    },
  });
  if (!row) return undefined;
  return {
    ...row,
    onboardingStatus: row.onboardingStatus as OnboardingRow["onboardingStatus"],
    onboardingStartedAt: row.onboardingStartedAt == null ? null : num(row.onboardingStartedAt),
    onboardingCompletedAt: row.onboardingCompletedAt == null ? null : num(row.onboardingCompletedAt),
    onboardingSkippedAt: row.onboardingSkippedAt == null ? null : num(row.onboardingSkippedAt),
    personalEventProtectionUntil: num(row.personalEventProtectionUntil),
    firstCustomerAssistUsed: row.firstCustomerAssistUsed ? 1 : 0,
    freeTutorialRelocationUsed: row.freeTutorialRelocationUsed ? 1 : 0,
  };
}

export async function onboardingMilestoneRows(playerId: string): Promise<{ milestoneId: string; xp: number; achievedAt: number }[]> {
  const rows = await prisma.plotgoOnboardingMilestone.findMany({
    where: { playerId },
    orderBy: { achievedAt: "asc" },
  });
  return rows.map((row) => ({ milestoneId: row.milestoneId, xp: row.xp, achievedAt: num(row.achievedAt) }));
}

export async function onboardingSnapshot(playerId: string) {
  const row = await onboardingRow(playerId);
  if (!row) return null;
  const milestones = await onboardingMilestoneRows(playerId);
  const achieved = milestones.map((milestone) => milestone.milestoneId);
  const guide = row.onboardingStatus === "active" ? onboardingGuideFor(row.onboardingStep) ?? null : null;
  const elapsedMinutes = row.onboardingStartedAt == null ? 0 : Math.max(0, (Date.now() - row.onboardingStartedAt) / 60_000);
  return {
    sessionId: row.onboardingSessionId,
    startedAt: row.onboardingStartedAt,
    status: row.onboardingStatus,
    step: row.onboardingStep,
    xp: row.onboardingXp,
    level: onboardingLevelForXp(row.onboardingXp),
    completedAt: row.onboardingCompletedAt,
    skippedAt: row.onboardingSkippedAt,
    protectionUntil: row.personalEventProtectionUntil,
    recovery: {
      firstCustomerAssistUsed: row.firstCustomerAssistUsed === 1,
      freeTutorialRelocationUsed: row.freeTutorialRelocationUsed === 1,
    },
    elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
    guide: guide ? { ...guide, overdue: elapsedMinutes > ((onboardingMilestone(guide.milestoneId)?.targetMinute ?? 0) + 2) } : null,
    milestones: ONBOARDING_MILESTONES.map((milestone) => ({
      ...milestone,
      achievedAt: milestones.find((item) => item.milestoneId === milestone.id)?.achievedAt ?? null,
    })),
    achieved,
  };
}

export async function ensureOnboardingStarted(playerId: string, now = Date.now()) {
  const row = await onboardingRow(playerId);
  if (!row || row.onboardingStartedAt != null || row.onboardingStatus !== "active") return;
  const sessionId = newId();
  await prisma.player.update({
    where: { id: playerId },
    data: {
      onboardingSessionId: sessionId,
      onboardingStartedAt: now,
      onboardingStep: "onboarding_started",
      personalEventProtectionUntil: BigInt(now + 60 * 60_000),
    },
  });
  await prisma.plotgoOnboardingMilestone.createMany({
    data: [{ playerId, milestoneId: "onboarding_started", xp: 0, sourceEvent: "session.start", achievedAt: now }],
    skipDuplicates: true,
  });
}

export async function recordOnboardingMilestone(playerId: string, milestoneId: string, sourceEvent: string, now = Date.now()) {
  const milestone = onboardingMilestone(milestoneId);
  const row = await onboardingRow(playerId);
  if (!milestone || !row || row.onboardingStatus !== "active") return false;
  const created = await prisma.plotgoOnboardingMilestone.createMany({
    data: [{ playerId, milestoneId: milestone.id, xp: milestone.xp, sourceEvent, achievedAt: now }],
    skipDuplicates: true,
  });
  if (created.count !== 1) return false;
  const xp = row.onboardingXp + milestone.xp;
  const achieved = (await onboardingMilestoneRows(playerId)).map((item) => item.milestoneId);
  const nextStep = onboardingStepForMilestones(achieved, row.onboardingStatus);
  const requiredIds = ONBOARDING_MILESTONES.filter((item) => item.required).map((item) => item.id);
  const complete = requiredIds.every((id) => achieved.includes(id));
  await prisma.$executeRaw`
    UPDATE players
    SET "onboardingXp" = ${xp}, "onboardingStep" = ${nextStep}, "onboardingStatus" = ${complete ? "completed" : "active"},
      "onboardingCompletedAt" = CASE WHEN ${complete} THEN COALESCE("onboardingCompletedAt", ${now}) ELSE "onboardingCompletedAt" END
    WHERE id = ${playerId}
  `;
  return true;
}

export function hasTutorialCashAccessSynergy(board: PlacedCard[]): boolean {
  return resolvePlacement(board).links.some((link) => link.rule === "cash_kiosk+savings_stand");
}

export async function tutorialRelocationAvailable(playerId: string, board: PlacedCard[], now = Date.now()): Promise<boolean> {
  const row = await onboardingRow(playerId);
  if (!row || row.onboardingStatus !== "active" || row.freeTutorialRelocationUsed === 1 || hasTutorialCashAccessSynergy(board)) return false;
  if (!row.onboardingStartedAt || now - row.onboardingStartedAt > 20 * 60_000) return false;
  return board.some((card) => card.type === "cash_kiosk") && board.some((card) => card.type === "savings_stand");
}

/**
 * v1.0 empire level: authoritative players.empireLevel (XP-driven via the
 * v1.0 award paths in empire.service, promotion-gated). Onboarding XP stays
 * display-only and never feeds progression. The `board` argument is kept for
 * caller compatibility and ignored.
 */
export async function currentEmpireLevel(playerId: string, _board?: PlacedCard[]): Promise<number> {
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { empireLevel: true } });
  return row ? clampLevel(row.empireLevel) : 1;
}
