-- Field-level manual override flags for Archive charge columns (pull sync must not overwrite).
ALTER TABLE "archive_rows" ADD COLUMN "manual_overrides" JSONB NOT NULL DEFAULT '{}';

-- Parking was always staff-entered; preserve that semantics for existing values.
UPDATE "archive_rows"
SET "manual_overrides" = jsonb_set("manual_overrides", '{parking}', 'true'::jsonb)
WHERE "parking" IS NOT NULL;
