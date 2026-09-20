/**
 * The company that owns vehicles created by domains that have no company input
 * of their own.
 *
 * This exists for exactly two legacy paths: the sales import (`imports/`) and
 * purchase experiences (`purchase-experiences/`). Both predate Diamond fleet
 * ownership, their source files carry no company column, and both create
 * Vehicles as a side effect of a CX record. Rather than guessing inside the
 * Vehicle service — which would silently mis-assign a fleet vehicle — those
 * domains resolve this company explicitly and visibly.
 *
 * Diamond fleet paths (Add Vehicle, Contract creation) must NEVER use this:
 * `Vehicle.companyId` is chosen by staff, and `Contract.companyId` is inherited
 * from the Vehicle. When the importer gains a company column, replace the call
 * sites with that value and delete this module.
 */
export const DEFAULT_OPERATING_COMPANY_CODE = "UNIQUE";

type CompanyReader = {
  operatingCompany: {
    findUnique(args: {
      where: { code: string };
      select: { id: true };
    }): Promise<{ id: number } | null>;
  };
};

export async function resolveDefaultOperatingCompanyId(db: CompanyReader): Promise<number> {
  const company = await db.operatingCompany.findUnique({
    where: { code: DEFAULT_OPERATING_COMPANY_CODE },
    select: { id: true },
  });
  if (!company) {
    throw new Error(`Operating company ${DEFAULT_OPERATING_COMPANY_CODE} is missing — run the base seed.`);
  }
  return company.id;
}
