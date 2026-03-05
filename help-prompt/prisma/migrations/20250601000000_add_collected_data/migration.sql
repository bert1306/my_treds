-- CreateTable
CREATE TABLE "CollectedData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectedData_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectedData_sessionId_key_key" ON "CollectedData"("sessionId", "key");

-- CreateIndex
CREATE INDEX "CollectedData_sessionId_idx" ON "CollectedData"("sessionId");
