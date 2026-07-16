ALTER TABLE "Report" ADD COLUMN "guestTokenHash" TEXT;
CREATE UNIQUE INDEX "Report_guestTokenHash_key" ON "Report"("guestTokenHash");
ALTER TABLE "ReportReply" ADD COLUMN "guestName" TEXT;
ALTER TABLE "ReportReply" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "ReportReply" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ReportReply" DROP CONSTRAINT IF EXISTS "ReportReply_userId_fkey";
ALTER TABLE "ReportReply" ADD CONSTRAINT "ReportReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
