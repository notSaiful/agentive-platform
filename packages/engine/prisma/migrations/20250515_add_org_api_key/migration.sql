-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "apiKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_apiKey_key" ON "Organization"("apiKey");

-- CreateIndex
CREATE INDEX "Organization_apiKey_idx" ON "Organization"("apiKey");
