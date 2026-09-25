import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/postgres/client";
import { newId } from "../../shared/types";

type Db = Prisma.TransactionClient | typeof prisma;

export async function auditEvent(db: Db, playerId: string | null, eventId: string | null, auditType: string, payload: unknown): Promise<string> {
  const id = newId();
  const payloadJson = JSON.stringify(payload);
  const resolutionHash = createHash("sha256").update(payloadJson).digest("hex");
  await db.plotgoEventAudit.create({
    data: {
      id,
      playerId,
      eventId,
      auditType,
      resolutionHash,
      payloadJson: JSON.parse(payloadJson) as object,
      createdAt: Date.now(),
    },
  });
  return resolutionHash;
}
