-- Shared world map: one hex region per founder

CREATE TABLE "world_regions" (
    "id" TEXT NOT NULL,
    "q" INTEGER NOT NULL,
    "r" INTEGER NOT NULL,
    "ring" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "ownerId" TEXT,
    "claimedAt" BIGINT,

    CONSTRAINT "world_regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "world_regions_ownerId_key" ON "world_regions"("ownerId");
CREATE INDEX "world_regions_ring_idx" ON "world_regions"("ring");
