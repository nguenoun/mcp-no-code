-- CreateEnum
CREATE TYPE "AuthMode" AS ENUM ('API_KEY', 'OAUTH');

-- AlterTable
ALTER TABLE "mcp_servers" ADD COLUMN     "authMode" "AuthMode" NOT NULL DEFAULT 'API_KEY';

-- CreateTable
CREATE TABLE "oauth_apps" (
    "id" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mcpServerId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_apps_clientId_key" ON "oauth_apps"("clientId");

-- CreateIndex
CREATE INDEX "oauth_apps_mcpServerId_idx" ON "oauth_apps"("mcpServerId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_codes_code_key" ON "oauth_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_codes_code_idx" ON "oauth_codes"("code");

-- CreateIndex
CREATE INDEX "oauth_codes_userId_idx" ON "oauth_codes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_jti_key" ON "oauth_tokens"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_accessToken_key" ON "oauth_tokens"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_tokens_refreshToken_key" ON "oauth_tokens"("refreshToken");

-- CreateIndex
CREATE INDEX "oauth_tokens_userId_idx" ON "oauth_tokens"("userId");

-- CreateIndex
CREATE INDEX "oauth_tokens_mcpServerId_idx" ON "oauth_tokens"("mcpServerId");

-- CreateIndex
CREATE INDEX "oauth_tokens_jti_idx" ON "oauth_tokens"("jti");

-- AddForeignKey
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "mcp_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauth_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_mcpServerId_fkey" FOREIGN KEY ("mcpServerId") REFERENCES "mcp_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
