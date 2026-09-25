import {
  empireLevel,
  onboardingGuideFor,
  onboardingLevel as onboardingLevelForXp,
  onboardingMilestone,
  onboardingStep as onboardingStepForMilestones,
  resolvePlacement,
  ONBOARDING_MILESTONES,
  type PlacedCard,
} from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";

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

export async function currentEmpireLevel(playerId: string, board: PlacedCard[]): Promise<number> {
  const row = await onboardingRow(playerId);
  return row && row.onboardingXp > 0 ? Math.max(empireLevel(board), onboardingLevelForXp(row.onboardingXp)) : empireLevel(board);
}
