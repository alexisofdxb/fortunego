-- v0.2 land & empire progression (Financial_Empire_Balancing_Model_v0.2, Phase 2).
-- Adds the XP-driven empire level columns and the plotgo_land ownership table,
-- then backfills both from existing card placements.

ALTER TABLE "players" ADD COLUMN "empireLevel" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "players" ADD COLUMN "empireXp" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "plotgo_land" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "hexId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "priceMinor" BIGINT NOT NULL DEFAULT 0,
  "acquiredAt" BIGINT NOT NULL,
  CONSTRAINT "plotgo_land_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plotgo_land_playerId_hexId_key" ON "plotgo_land"("playerId", "hexId");
CREATE INDEX "plotgo_land_playerId_idx" ON "plotgo_land"("playerId");

-- (a) Empire level backfill: newLevel = highest L whose v0.2 cumulativeBuildings(L)
-- is <= max(2, distinct building types owned), min 1 (cumulativeBuildings from
-- v02/progression.json: 2,5,8,10,12,15,18,20,22,25,28,30,32,35,38,40,41,42,44,45,46,47,49,50).
WITH types AS (
  SELECT "playerId", COUNT(DISTINCT type) AS distinct_types
  FROM "cards"
  GROUP BY "playerId"
),
levels AS (
  SELECT p.id,
    GREATEST(1, COALESCE((
      SELECT MAX(t.level)
      FROM (VALUES (1,2),(2,5),(3,8),(4,10),(5,12),(6,15),(7,18),(8,20),(9,22),(10,25),
                   (11,28),(12,30),(13,32),(14,35),(15,38),(16,40),(17,41),(18,42),
                   (19,44),(20,45),(21,46),(22,47),(23,49),(24,50)) AS t(level, cumulative)
      WHERE t.cumulative <= GREATEST(2, COALESCE(types.distinct_types, 0))
    ), 1)) AS new_level
  FROM "players" p
  LEFT JOIN types ON types."playerId" = p.id
)
UPDATE "players" SET "empireLevel" = levels.new_level
FROM levels WHERE "players".id = levels.id;

-- (b) Land ownership backfill: every hex a player's cards occupy becomes an
-- owned parcel (legacy cash_purchase at zero price; cards keep their hexIds).
INSERT INTO "plotgo_land" ("id", "playerId", "hexId", "method", "priceMinor", "acquiredAt")
SELECT gen_random_uuid(), c."playerId", c."hexId", 'cash_purchase', 0, (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM (SELECT DISTINCT "playerId", "hexId" FROM "cards") c
ON CONFLICT DO NOTHING;

-- Players with no cards get the starter parcel (hex "35" = parcel D05) as a grant.
INSERT INTO "plotgo_land" ("id", "playerId", "hexId", "method", "priceMinor", "acquiredAt")
SELECT gen_random_uuid(), p.id, '35', 'starter_grant', 0, (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM "players" p
WHERE NOT EXISTS (SELECT 1 FROM "cards" c WHERE c."playerId" = p.id)
ON CONFLICT DO NOTHING;
