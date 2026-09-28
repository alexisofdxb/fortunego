-- Hex-only board: cards move from square (x, y, orientation) to one hex per card.
-- Backfill: each player's cards (placement order: placedAt, then id) are assigned
-- to the ring-order hexes (concentric center-out) sequentially, ignoring stage.

ALTER TABLE "cards" ADD COLUMN "hexId" TEXT;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "playerId" ORDER BY "placedAt" ASC, id ASC) AS rn
  FROM "cards"
),
ring(pos, hex_id) AS (
  VALUES (1,'h4-2'),(2,'h5-2'),(3,'h3-2'),(4,'h6-2'),(5,'h2-2'),(6,'h4-1'),(7,'h5-3'),(8,'h3-3'),(9,'h7-1'),(10,'h6-1'),(11,'h1-1'),(12,'h2-1'),(13,'h8-0'),(14,'h7-2'),(15,'h0-1'),(16,'h1-2'),(17,'h4-3'),(18,'h5-1'),(19,'h3-1'),(20,'h0-0'),(21,'h6-3'),(22,'h2-3'),(23,'h7-0'),(24,'h1-0'),(25,'h8-1'),(26,'h3-4'),(27,'h5-4'),(28,'h4-0'),(29,'h6-0'),(30,'h2-0'),(31,'h7-3'),(32,'h4-4'),(33,'h5-0'),(34,'h6-4'),(35,'h3-0')
)
UPDATE "cards" SET "hexId" = ring.hex_id
FROM ordered JOIN ring ON ring.pos = ordered.rn
WHERE "cards".id = ordered.id;

ALTER TABLE "cards" ALTER COLUMN "hexId" SET NOT NULL;

-- Drop the legacy square geometry columns.
ALTER TABLE "cards" DROP COLUMN "x";
ALTER TABLE "cards" DROP COLUMN "y";
ALTER TABLE "cards" DROP COLUMN "orientation";

CREATE INDEX "cards_hexId_idx" ON "cards"("hexId");
