-- Final custody photo vocabulary: FRONT, REAR, LEFT, RIGHT, OTHER only.
-- Fails if any custody photo row still uses a legacy angle (no automatic deletes).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contract_car_out_draft_photos
    WHERE angle::text NOT IN ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER')
    UNION ALL
    SELECT 1 FROM contract_car_out_photos
    WHERE angle::text NOT IN ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER')
    UNION ALL
    SELECT 1 FROM contract_car_in_draft_photos
    WHERE angle::text NOT IN ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER')
    UNION ALL
    SELECT 1 FROM contract_car_in_photos
    WHERE angle::text NOT IN ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER')
  ) THEN
    RAISE EXCEPTION 'custody_photo_angle_migration_blocked: legacy ContractInspectionAngle values remain in custody photo tables';
  END IF;
END $$;

CREATE TYPE "ContractInspectionAngle_new" AS ENUM ('FRONT', 'REAR', 'LEFT', 'RIGHT', 'OTHER');

ALTER TABLE "contract_car_out_draft_photos"
  ALTER COLUMN "angle" TYPE "ContractInspectionAngle_new"
  USING ("angle"::text::"ContractInspectionAngle_new");

ALTER TABLE "contract_car_out_photos"
  ALTER COLUMN "angle" TYPE "ContractInspectionAngle_new"
  USING ("angle"::text::"ContractInspectionAngle_new");

ALTER TABLE "contract_car_in_draft_photos"
  ALTER COLUMN "angle" TYPE "ContractInspectionAngle_new"
  USING ("angle"::text::"ContractInspectionAngle_new");

ALTER TABLE "contract_car_in_photos"
  ALTER COLUMN "angle" TYPE "ContractInspectionAngle_new"
  USING ("angle"::text::"ContractInspectionAngle_new");

DROP TYPE "ContractInspectionAngle";

ALTER TYPE "ContractInspectionAngle_new" RENAME TO "ContractInspectionAngle";
