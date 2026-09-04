import { Prisma } from "@prisma/client";
import { normalizeName } from "src/lib/master-data/code";

/**
 * Master-data models whose logical identity is matched by a human `name` (via the
 * `normalizedName` key) rather than a `code`: branch, vehicle model, salesperson.
 * The sales importer resolves/creates these by business name.
 */
const NAME_KEYED_MODELS: ReadonlySet<string> = new Set([
  "Branch",
  "VehicleModel",
  "Salesperson",
]);

type WriteData = { name?: unknown; normalizedName?: unknown };

/** Derive `normalizedName` from a write payload's `name` (plain value or `{ set }`). */
function applyToData(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const d = data as WriteData;
  const name = d.name;
  if (typeof name === "string") {
    d.normalizedName = normalizeName(name);
  } else if (
    name &&
    typeof name === "object" &&
    "set" in name &&
    typeof (name as { set: unknown }).set === "string"
  ) {
    d.normalizedName = normalizeName((name as { set: string }).set);
  }
}

/**
 * Keep `normalizedName` in lock-step with `name` for every create / update /
 * upsert / createMany on the name-keyed master-data entities. Centralizing the
 * derivation here means services, the sales importer, seeds and tests never set it
 * by hand and can never drift from the logical unique keys (`branches_normalizedName_key`,
 * `vehicle_models_normalizedName_key`, `salespeople_branchId_normalizedName_key`).
 * `normalizedName` is a MATCH key only — `name` stays the verbatim display value.
 */
export const normalizedNameExtension = Prisma.defineExtension({
  name: "normalizedName",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (model && NAME_KEYED_MODELS.has(model)) {
          const a = args as { data?: unknown; create?: unknown; update?: unknown };
          switch (operation) {
            case "create":
            case "update":
              applyToData(a.data);
              break;
            case "createMany":
            case "createManyAndReturn":
              if (Array.isArray(a.data)) a.data.forEach(applyToData);
              else applyToData(a.data);
              break;
            case "upsert":
              applyToData(a.create);
              applyToData(a.update);
              break;
          }
        }
        return query(args);
      },
    },
  },
});
