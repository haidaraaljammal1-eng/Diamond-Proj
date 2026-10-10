-- Phase 5B: per-account non-blocking sync lease (multi-replica safe).
ALTER TABLE "gps_provider_accounts"
ADD COLUMN "syncLeaseOwner" TEXT,
ADD COLUMN "syncLeaseExpiresAt" TIMESTAMP(3);
