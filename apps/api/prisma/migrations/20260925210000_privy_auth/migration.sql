-- AlterTable
ALTER TABLE "players" ADD COLUMN "privyUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "players_privyUserId_key" ON "players"("privyUserId");
