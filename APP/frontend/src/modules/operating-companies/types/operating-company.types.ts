export interface OperatingCompanyDto {
  id: number;
  code: string;
  displayName: string;
  legalNameAr: string;
  legalNameEn: string;
  accentColor: string;
  isActive: boolean;
}

export type OperatingCompanyIdentity = Pick<
  OperatingCompanyDto,
  "id" | "code" | "displayName" | "accentColor"
>;
