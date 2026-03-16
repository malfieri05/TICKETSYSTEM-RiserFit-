-- Gmail OAuth2: store refresh token and connected email so any @gmail.com can connect (no Workspace required)
ALTER TABLE "email_automation_config" ADD COLUMN "gmailRefreshToken" TEXT;
ALTER TABLE "email_automation_config" ADD COLUMN "gmailConnectedEmail" TEXT;
