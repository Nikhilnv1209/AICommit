-- AuditLog: append-only trail, no foreign keys on purpose (entries outlive
-- the user/project they reference). Apply with psql or the pg client because
-- `prisma migrate` cannot connect to this database (TLS/P1011).

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "projectId" TEXT,
    "target" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
