-- Empire_Progression_System_v1.0 (canonical; replaces the v0.2 progression
-- mechanics). Adds promotion/daily-cap/milestone state to players and backfills
-- empireLevel through the v1.0 evaluate semantics (XP table + promotion gates;
-- existing XP stays unchanged, promotions start empty so a gate only passes when
-- its requirements are met — most players land at level 1).

ALTER TABLE "players" ADD COLUMN "promotions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "players" ADD COLUMN "dailyObjectiveXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "dailyHuntXp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "completedSetsAwarded" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN "dailyXpResetDay" TEXT NOT NULL DEFAULT '';

-- Backfill empireLevel = displayedLevel per v1.0:
--   candidate = highest L with cumulativeXp(L) <= empireXp
--   displayed = candidate capped by (requiredLevel - 1) of the first gate whose
--   requirements are unmet (gates: Starter 5, Growing 9, Established 13,
--   Elite 17, Tycoon 21; caps 4/8/12/16/20).
WITH counters AS (
  SELECT p.id,
    (SELECT COUNT(*) FROM "plotgo_land" l WHERE l."playerId" = p.id) AS hexes,
    (SELECT COUNT(*) FROM "cards" c WHERE c."playerId" = p.id) AS businesses,
    (SELECT COUNT(*) FROM "cards" c WHERE c."playerId" = p.id AND c.stage >= 2) AS stage2plus,
    (SELECT COUNT(DISTINCT f.ticker) FROM "fragments" f
      WHERE f."playerId" = p.id AND COALESCE(f."unitsMicros", f."unitsBps" * 10000) > 0) AS stocks
  FROM "players" p
),
eval AS (
  SELECT c.id,
    COALESCE((
      SELECT MAX(t.level) FROM (VALUES
        (1,0),(2,250),(3,650),(4,1200),(5,2000),(6,3000),(7,4300),(8,6000),
        (9,8200),(10,10800),(11,14000),(12,17800),(13,22400),(14,27800),
        (15,34200),(16,41800),(17,50800),(18,61400),(19,73800),(20,88200),
        (21,105000),(22,124500),(23,147000),(24,173000)) AS t(level, xp)
      WHERE t.xp <= p."empireXp"
    ), 1) AS candidate,
    c.hexes, c.businesses, c.stage2plus, c.stocks
  FROM counters c
  JOIN "players" p ON p.id = c.id
)
UPDATE "players" SET "empireLevel" = GREATEST(1, LEAST(e.candidate, LEAST(
  CASE WHEN e.hexes < 6  OR e.businesses < 6  OR e.stage2plus < 2  OR e.stocks < 3  THEN 4  ELSE 24 END,
  CASE WHEN e.hexes < 18 OR e.businesses < 14 OR e.stage2plus < 5  OR e.stocks < 6  THEN 8  ELSE 24 END,
  CASE WHEN e.hexes < 26 OR e.businesses < 22 OR e.stage2plus < 8  OR e.stocks < 10 THEN 12 ELSE 24 END,
  CASE WHEN e.hexes < 30 OR e.businesses < 30 OR e.stage2plus < 12 OR e.stocks < 14 THEN 16 ELSE 24 END,
  CASE WHEN e.hexes < 32 OR e.businesses < 38 OR e.stage2plus < 18 OR e.stocks < 18 THEN 20 ELSE 24 END
)))
FROM eval e
WHERE "players".id = e.id;
