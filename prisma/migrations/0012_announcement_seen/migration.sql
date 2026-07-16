CREATE TABLE "UserAnnouncementSeen" (
  "userId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAnnouncementSeen_pkey" PRIMARY KEY ("userId", "announcementId")
);
ALTER TABLE "UserAnnouncementSeen" ADD CONSTRAINT "UserAnnouncementSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAnnouncementSeen" ADD CONSTRAINT "UserAnnouncementSeen_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
