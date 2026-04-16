-- CreateEnum
CREATE TYPE "RuntimeMode" AS ENUM ('LOCAL', 'CLOUDFLARE');

-- AlterTable
ALTER TABLE "mcp_servers" ADD COLUMN "runtimeMode" "RuntimeMode" NOT NULL DEFAULT 'LOCAL';
