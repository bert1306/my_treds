-- AlterTable
ALTER TABLE "User" ADD COLUMN "deviceId" TEXT;
ALTER TABLE "User" ADD COLUMN "login" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "telegram" TEXT;
ALTER TABLE "User" ADD COLUMN "role" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_deviceId_key" ON "User"("deviceId");
