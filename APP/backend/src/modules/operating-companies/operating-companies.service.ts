import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import type {
  ListOperatingCompaniesQuerySchema,
  OperatingCompanyDto,
} from "src/modules/operating-companies/operating-companies.schema";

const COMPANY_SELECT = {
  id: true,
  code: true,
  displayName: true,
  legalNameAr: true,
  legalNameEn: true,
  accentColor: true,
  isActive: true,
} as const;

/**
 * Read-only access to the operating companies. Ownership is written by the
 * Vehicle and Contract domains; this module only exposes the master data they
 * reference (pickers, filters, and the legal names the official contract freezes).
 */
export function createOperatingCompaniesService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(
    query: z.infer<typeof ListOperatingCompaniesQuerySchema>,
  ): Promise<OperatingCompanyDto[]> {
    return prisma.operatingCompany.findMany({
      where: query.activeOnly ? { isActive: true } : {},
      select: COMPANY_SELECT,
      orderBy: { code: "asc" },
    });
  }

  async function get(id: number): Promise<OperatingCompanyDto> {
    const company = await prisma.operatingCompany.findUnique({
      where: { id },
      select: COMPANY_SELECT,
    });
    if (!company) throw AppError.notFound("Operating company not found");
    return company;
  }

  return { list, get };
}
