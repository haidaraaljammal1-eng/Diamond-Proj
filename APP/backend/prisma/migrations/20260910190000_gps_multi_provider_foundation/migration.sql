-- GPS multi-provider data foundation (Phase 1). No credentials seeded.

-- CreateTable
CREATE TABLE "gps_provider_accounts" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "companyScopeId" INTEGER,
    "config" JSONB,
    "secretEncrypted" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "lastDeviceCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_binding_histories" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "externalDeviceUid" TEXT,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_gps_binding_histories_pkey" PRIMARY KEY ("id")
);

-- AlterTable vehicle_gps_bindings — add nullable columns first for backfill
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "providerAccountId" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "externalDeviceUid" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "deviceType" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "providerDeviceTypeId" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "simNumber" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "installationType" TEXT;
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "installationDate" TIMESTAMP(3);
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);
ALTER TABLE "vehicle_gps_bindings" ADD COLUMN "providerDeviceExtras" JSONB;

-- Backfill one legacy provider account per distinct providerKey (unscoped, disabled, no secrets)
INSERT INTO "gps_provider_accounts" (
    "id",
    "providerKey",
    "accountKey",
    "displayName",
    "enabled",
    "companyScopeId",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    keys."providerKey",
    'legacy-migrated',
    'Migrated ' || keys."providerKey" || ' account',
    false,
    NULL,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "providerKey" FROM "vehicle_gps_bindings"
) AS keys;

UPDATE "vehicle_gps_bindings" AS b
SET "providerAccountId" = a."id"
FROM "gps_provider_accounts" AS a
WHERE a."providerKey" = b."providerKey"
  AND a."accountKey" = 'legacy-migrated'
  AND b."providerAccountId" IS NULL;

ALTER TABLE "vehicle_gps_bindings" ALTER COLUMN "providerAccountId" SET NOT NULL;

-- AlterTable vehicle_gps_latest_states — extended telemetry (all nullable)
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "previousLatitude" DECIMAL(10,7);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "previousLongitude" DECIMAL(11,7);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "ignitionOn" BOOLEAN;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "providerDeviceState" TEXT;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "addressLine" VARCHAR(512);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "satelliteCount" INTEGER;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "fuelLevel" DECIMAL(12,4);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "fuelUnit" TEXT;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "batteryLevel" DECIMAL(12,4);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "batteryUnit" TEXT;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "isCharging" BOOLEAN;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "parkingEnabled" BOOLEAN;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "immobilizerCapable" BOOLEAN;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "providerUpdatedAt" TIMESTAMP(3);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "odometerValue" DECIMAL(18,4);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "odometerUnit" TEXT;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "distanceTodayValue" DECIMAL(18,4);
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "distanceTodayUnit" TEXT;
ALTER TABLE "vehicle_gps_latest_states" ADD COLUMN "providerExtras" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "gps_provider_accounts_providerKey_accountKey_key" ON "gps_provider_accounts"("providerKey", "accountKey");

CREATE INDEX "gps_provider_accounts_companyScopeId_idx" ON "gps_provider_accounts"("companyScopeId");

CREATE INDEX "gps_provider_accounts_enabled_idx" ON "gps_provider_accounts"("enabled");

CREATE INDEX "vehicle_gps_binding_histories_vehicleId_idx" ON "vehicle_gps_binding_histories"("vehicleId");

CREATE INDEX "vehicle_gps_binding_histories_providerAccountId_idx" ON "vehicle_gps_binding_histories"("providerAccountId");

CREATE INDEX "vehicle_gps_bindings_providerAccountId_isActive_idx" ON "vehicle_gps_bindings"("providerAccountId", "isActive");

CREATE UNIQUE INDEX "vehicle_gps_bindings_active_device_key" ON "vehicle_gps_bindings"("providerAccountId", "externalDeviceId") WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "gps_provider_accounts" ADD CONSTRAINT "gps_provider_accounts_companyScopeId_fkey" FOREIGN KEY ("companyScopeId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_gps_bindings" ADD CONSTRAINT "vehicle_gps_bindings_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "gps_provider_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_gps_binding_histories" ADD CONSTRAINT "vehicle_gps_binding_histories_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
