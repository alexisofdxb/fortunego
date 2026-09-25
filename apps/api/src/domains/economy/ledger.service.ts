import { utcDay } from "@plotgo/game";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId, num } from "../../shared/types";

type Db = Prisma.TransactionClient | typeof prisma;

export async function ensureOpeningLedger(db: Db, playerId: string, balanceMinor: number) {
  const count = await db.plotgoLedger.count({ where: { playerId } });
  if (count === 0) {
    await db.plotgoLedger.create({
      data: {
        id: newId(),
        playerId,
        day: utcDay(),
        reason: "grant",
        amountMinor: balanceMinor,
        balanceMinor,
        metadataJson: { source: "founder_plot" },
        createdAt: Date.now(),
      },
    });
  }
}

export async function recordLedger(db: Db, playerId: string, day: string, reason: string, amountMinor: number, balanceMinor: number, metadata: unknown) {
  await db.plotgoLedger.create({
    data: {
      id: newId(),
      playerId,
      day,
      reason,
      amountMinor,
      balanceMinor,
      metadataJson: (metadata ?? {}) as Prisma.InputJsonValue,
      createdAt: Date.now(),
    },
  });
}

/**
 * Atomically consumes a one-time tutorial recovery flag and writes the audit ledger row.
 * Mirrors the old UPDATE ... WHERE <flag> = 0 + INSERT OR IGNORE transaction.
 */
export async function claimTutorialRecovery(
  playerId: string,
  kind: "first_customer_assist" | "free_tutorial_relocation",
  creditedMinor: number,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const flag = kind === "first_customer_assist" ? { firstCustomerAssistUsed: true } : { freeTutorialRelocationUsed: true };
  const now = Date.now();
  let claimed = false;
  await prisma.$transaction(async (tx) => {
    if (kind === "first_customer_assist") {
      const updated = await tx.player.updateMany({ where: { id: playerId, firstCustomerAssistUsed: false }, data: flag });
      claimed = updated.count === 1;
    } else {
      const updated = await tx.player.updateMany({ where: { id: playerId, freeTutorialRelocationUsed: false }, data: flag });
      claimed = updated.count === 1;
    }
    if (!claimed) return;
    const credited = Math.max(0, Math.round(creditedMinor));
    await tx.plotgoTutorialRecoveryLedger.create({
      data: {
        id: newId(),
        playerId,
        kind,
        creditedMinor: credited,
        sourceEvent: `onboarding.${kind}`,
        metadataJson: (metadata ?? {}) as Prisma.InputJsonValue,
        createdAt: now,
      },
    });
    const balance = await tx.player.findUnique({ where: { id: playerId }, select: { cashMinor: true } });
    await recordLedger(tx, playerId, utcDay(now), "onboarding_recovery", 0, num(balance?.cashMinor), { kind, creditedMinor: credited, ...metadata });
  });
  return claimed;
}
