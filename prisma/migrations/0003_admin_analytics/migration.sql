CREATE TABLE "SiteVisit" (
  "id" TEXT NOT NULL,
  "visitorId" TEXT NOT NULL,
  "userId" TEXT,
  "path" TEXT NOT NULL,
  "userAgent" TEXT,
  "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteVisit_visitedAt_idx" ON "SiteVisit"("visitedAt");
CREATE INDEX "SiteVisit_visitorId_visitedAt_idx" ON "SiteVisit"("visitorId", "visitedAt");
CREATE INDEX "SiteVisit_userId_visitedAt_idx" ON "SiteVisit"("userId", "visitedAt");
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
