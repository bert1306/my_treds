/*
  Warnings:

  - Added the required column `contentHash` to the `ContentItem` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT,
    "originalText" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentItem_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ContentItem" ("createdAt", "id", "language", "originalText", "source", "threadId", "title") SELECT "createdAt", "id", "language", "originalText", "source", "threadId", "title" FROM "ContentItem";
DROP TABLE "ContentItem";
ALTER TABLE "new_ContentItem" RENAME TO "ContentItem";
CREATE UNIQUE INDEX "ContentItem_threadId_contentHash_key" ON "ContentItem"("threadId", "contentHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
