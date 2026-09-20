/**
 * The compact owning-company reference every operational projection carries.
 *
 * One select, reused by Vehicles, Maintenance, GPS and TARS, so a list never
 * needs a company lookup per row and no module re-declares the shape. Legal
 * names stay out: they belong to the official contract, not to operations.
 */
export const COMPANY_REF_SELECT = {
  id: true,
  code: true,
  displayName: true,
  accentColor: true,
} as const;

export type CompanyRef = {
  id: number;
  code: string;
  displayName: string;
  accentColor: string;
};
