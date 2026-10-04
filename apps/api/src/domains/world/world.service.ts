import { WORLD_CELLS } from "@plotgo/game";
import { prisma } from "../../infrastructure/postgres/client";
import { playerBoardView, founderName } from "../economy/visits.service";

async function seedWorld(): Promise<void> {
  const count = await prisma.worldRegion.count();
  if (count >= WORLD_CELLS.length) return;
  await prisma.worldRegion.createMany({
    data: WORLD_CELLS.map((cell) => ({
      id: cell.id,
      q: cell.q,
      r: cell.r,
      ring: cell.ring,
      label: cell.label,
    })),
    skipDuplicates: true,
  });
}

export async function assignWorldRegion(playerId: string): Promise<{ id: string; label: string; q: number; r: number }> {
  await seedWorld();
  const existing = await prisma.worldRegion.findUnique({ where: { ownerId: playerId } });
  if (existing) return { id: existing.id, label: existing.label, q: existing.q, r: existing.r };
  const now = Date.now();
  const open = await prisma.worldRegion.findFirst({
    where: { ownerId: null },
    orderBy: [{ ring: "asc" }, { id: "asc" }],
  });
  if (!open) throw new Error("World map is full");
  const claimed = await prisma.worldRegion.updateMany({
    where: { id: open.id, ownerId: null },
    data: { ownerId: playerId, claimedAt: now },
  });
  if (claimed.count !== 1) return assignWorldRegion(playerId);
  return { id: open.id, label: open.label, q: open.q, r: open.r };
}

async function backfillUnassigned(): Promise<void> {
  await seedWorld();
  const owned = await prisma.worldRegion.findMany({ where: { ownerId: { not: null } }, select: { ownerId: true } });
  const taken = new Set(owned.map((row) => row.ownerId).filter(Boolean) as string[]);
  const players = await prisma.player.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const player of players) {
    if (taken.has(player.id)) continue;
    await assignWorldRegion(player.id);
  }
}

export async function worldMap(viewerId: string) {
  await backfillUnassigned();
  const you = await assignWorldRegion(viewerId);
  const rows = await prisma.worldRegion.findMany({ orderBy: [{ ring: "asc" }, { id: "asc" }] });
  const owners = await prisma.player.findMany({
    where: { id: { in: rows.map((row) => row.ownerId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, archetype: true, empireLevel: true, lastMeaningfulActionAt: true, presenceState: true },
  });
  const byId = new Map(owners.map((row) => [row.id, row]));
  const now = Date.now();
  return {
    you: { regionId: you.id, label: you.label, q: you.q, r: you.r },
    regions: rows.map((row) => {
      const owner = row.ownerId ? byId.get(row.ownerId) : null;
      const last = owner ? Number(owner.lastMeaningfulActionAt) : 0;
      const online = owner ? now - last < 10 * 60_000 : false;
      return {
        id: row.id,
        q: row.q,
        r: row.r,
        ring: row.ring,
        label: row.label,
        ownerId: row.ownerId,
        name: owner ? founderName(owner) : null,
        empireLevel: owner?.empireLevel ?? null,
        presence: owner ? (online ? "online" : owner.presenceState) : "empty",
        you: row.ownerId === viewerId,
      };
    }),
  };
}

export async function visitWorldRegion(viewerId: string, regionId: string) {
  const region = await prisma.worldRegion.findUnique({ where: { id: regionId } });
  if (!region) return { error: "Unknown region", status: 404 as const };
  if (!region.ownerId) return { error: "No city in this region", status: 400 as const };
  if (region.ownerId === viewerId) return { error: "That is your city", status: 400 as const };
  const board = await playerBoardView(region.ownerId);
  if (!board) return { error: "City not found", status: 404 as const };
  return {
    status: 200 as const,
    region: { id: region.id, label: region.label, q: region.q, r: region.r },
    host: board,
  };
}
