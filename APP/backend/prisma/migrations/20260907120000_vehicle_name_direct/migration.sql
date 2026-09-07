-- AlterTable: direct fleet name + optional VehicleModel link
ALTER TABLE "vehicles" ADD COLUMN "vehicleName" TEXT;

ALTER TABLE "vehicles" ALTER COLUMN "modelId" DROP NOT NULL;
