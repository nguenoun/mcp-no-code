-- AlterTable: add optional credentialId FK to mcp_servers
ALTER TABLE "mcp_servers" ADD COLUMN "credentialId" TEXT;

-- AddForeignKey
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_credentialId_fkey"
  FOREIGN KEY ("credentialId")
  REFERENCES "credentials"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
