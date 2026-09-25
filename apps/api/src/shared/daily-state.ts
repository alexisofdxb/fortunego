import { prisma } from "../infrastructure/postgres/client";

export type DailyFlag = "huntOfferSet" | "huntRerolled" | "objectiveSet" | "objectiveRerolled";

/** Idempotency primitive for per-player daily systems (spec sheet 14): each
 * flag can be claimed at most once per (player, UTC day). The conditional
 * updateMany makes concurrent claimers race safely — exactly one wins. */
export async function claimDailyFlag(playerId: string, day: string, flag: DailyFlag): Promise<boolean> {
  await prisma.playerDailyState.createMany({ data: [{ playerId, day }], skipDuplicates: true });
  const claimed = await prisma.playerDailyState.updateMany({
    where: { playerId, day, [flag]: false },
    data: { [flag]: true },
  });
  return claimed.count === 1;
}

export async function dailyFlag(playerId: string, day: string, flag: DailyFlag): Promise<boolean> {
  const row = await prisma.playerDailyState.findUnique({ where: { playerId_day: { playerId, day } } });
  return row ? Boolean(row[flag]) : false;
}
