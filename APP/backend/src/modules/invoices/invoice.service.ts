import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { paginate } from "src/lib/http/pagination";
import { parseSort } from "src/lib/http/pagination";
import { toInvoiceDetail, toInvoiceListItem } from "src/modules/invoices/invoice.mapper";
import { invoiceNotFoundError } from "src/modules/invoices/invoices.errors";
import type { z } from "zod";
import type { InvoiceListQuerySchema } from "src/modules/invoices/invoices.schema";

type ListQuery = z.infer<typeof InvoiceListQuerySchema>;

const LIST_SORT_FIELDS = ["issueDate", "createdAt", "invoiceNumber", "totalAmount"] as const;

export function createInvoiceService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  return {
    async list(query: ListQuery) {
      const sort = parseSort(query.sort, LIST_SORT_FIELDS, {
        field: "issueDate",
        direction: "desc",
      });

      let companyId = query.companyId;
      if (!companyId && query.companyCode) {
        const company = await prisma.operatingCompany.findUnique({
          where: { code: query.companyCode },
          select: { id: true },
        });
        companyId = company?.id;
        if (query.companyCode && !companyId) {
          return paginate({
            page: query.page,
            pageSize: query.pageSize,
            count: async () => 0,
            findMany: async () => [],
          });
        }
      }

      const where: Prisma.InvoiceWhereInput = {
        ...(companyId ? { companyId } : {}),
        ...(query.invoiceType ? { invoiceType: query.invoiceType } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}),
        ...(query.dateFrom || query.dateTo
          ? {
              issueDate: {
                ...(query.dateFrom ? { gte: query.dateFrom } : {}),
                ...(query.dateTo ? { lte: query.dateTo } : {}),
              },
            }
          : {}),
        ...(query.search?.trim()
          ? {
              OR: [
                { contractNumberSnapshot: { contains: query.search.trim(), mode: "insensitive" } },
                { customerNameSnapshot: { contains: query.search.trim(), mode: "insensitive" } },
                { plateNumberSnapshot: { contains: query.search.trim(), mode: "insensitive" } },
                ...(Number.isInteger(Number(query.search.trim()))
                  ? [{ invoiceNumber: Number(query.search.trim()) }]
                  : []),
              ],
            }
          : {}),
      };

      return paginate({
        page: query.page,
        pageSize: query.pageSize,
        count: () => prisma.invoice.count({ where }),
        findMany: async (skip, take) => {
          const rows = await prisma.invoice.findMany({
            where,
            orderBy: { [sort.field]: sort.direction },
            skip,
            take,
            include: {
              company: { select: { code: true, displayName: true } },
              deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
            },
          });
          return rows.map(toInvoiceListItem);
        },
      });
    },

    async getDetail(id: string) {
      const row = await prisma.invoice.findUnique({
        where: { id },
        include: {
          company: { select: { code: true, displayName: true } },
          lines: { orderBy: { position: "asc" } },
          deliveries: { orderBy: { createdAt: "desc" } },
        },
      });
      if (!row) throw invoiceNotFoundError();
      return toInvoiceDetail(row);
    },

    async listForContract(contractId: string) {
      const rows = await prisma.invoice.findMany({
        where: { contractId },
        orderBy: { issueDate: "desc" },
        include: {
          company: { select: { code: true, displayName: true } },
          deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        },
      });
      return rows.map(toInvoiceListItem);
    },
  };
}
