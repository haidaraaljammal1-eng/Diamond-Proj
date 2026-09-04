import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createLookupsService } from "src/modules/lookups/lookups.service";
import {
  BranchLookupItem,
  BranchLookupQuery,
  CityLookupItem,
  CityLookupQuery,
  CommunicationTemplateLookupItem,
  CommunicationTemplateLookupQuery,
  CustomerLookupItem,
  CustomerLookupQuery,
  DepartmentLookupItem,
  DepartmentLookupQuery,
  PurchaseExperienceLookupItem,
  PurchaseExperienceLookupQuery,
  RegionLookupItem,
  RegionLookupQuery,
  RoleLookupItem,
  RoleLookupQuery,
  SalespersonLookupItem,
  SalespersonLookupQuery,
  UserLookupItem,
  UserLookupQuery,
  VehicleLookupItem,
  VehicleLookupQuery,
  VehicleModelLookupItem,
  VehicleModelLookupQuery,
} from "src/modules/lookups/lookups.schema";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";

/**
 * Lightweight lookup endpoints for selects/filters. Each endpoint accepts ANY of
 * two permissions (enforcement is any-of): a dedicated LOOKUP permission that lets
 * a user pick a value inside an authorized workflow WITHOUT page/CRUD access, OR
 * the owning resource's `.read` (so full-read holders keep working unchanged).
 *
 *  - Safe reference data (regions/cities/branches/vehicle-models/departments/
 *    salespeople/vehicles) → `reference_data.lookup` | `<resource>.read`
 *  - Sensitive entities (customers, users) → `<entity>.lookup` | `<entity>.read`
 *  - Published-only pickers (communication-templates) → `<entity>.lookup`
 *    | `<entity>.read`
 *
 * The full list/CRUD endpoints (`GET /branches`, `/customers`, …) remain gated on
 * `<resource>.read` only, so a lookup-only user still cannot open a management page
 * or read the full entity. The backend stays the authority even for dropdown data.
 */
export default async function lookupsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const lookups = createLookupsService(fastify);

  app.get(
    "/regions",
    {
      schema: {
        summary: "Lookup regions",
        operationId: "lookupRegions",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.REGIONS_READ],
        querystring: RegionLookupQuery,
        response: { 200: dataResponse(z.array(RegionLookupItem)), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await lookups.regions(request.query) }),
  );

  app.get(
    "/cities",
    {
      schema: {
        summary: "Lookup cities",
        operationId: "lookupCities",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.CITIES_READ],
        querystring: CityLookupQuery,
        response: { 200: dataResponse(z.array(CityLookupItem)), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await lookups.cities(request.query) }),
  );

  app.get(
    "/branches",
    {
      schema: {
        summary: "Lookup branches",
        operationId: "lookupBranches",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.BRANCHES_READ],
        querystring: BranchLookupQuery,
        response: { 200: dataResponse(z.array(BranchLookupItem)), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await lookups.branches(request.query) }),
  );

  app.get(
    "/vehicle-models",
    {
      schema: {
        summary: "Lookup vehicle models",
        operationId: "lookupVehicleModels",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.VEHICLE_MODELS_READ],
        querystring: VehicleModelLookupQuery,
        response: {
          200: dataResponse(z.array(VehicleModelLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.vehicleModels(request.query) }),
  );

  app.get(
    "/departments",
    {
      schema: {
        summary: "Lookup departments",
        operationId: "lookupDepartments",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.DEPARTMENTS_READ],
        querystring: DepartmentLookupQuery,
        response: {
          200: dataResponse(z.array(DepartmentLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.departments(request.query) }),
  );

  app.get(
    "/salespeople",
    {
      schema: {
        summary: "Lookup salespeople",
        operationId: "lookupSalespeople",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.SALESPEOPLE_READ],
        querystring: SalespersonLookupQuery,
        response: {
          200: dataResponse(z.array(SalespersonLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.salespeople(request.query) }),
  );

  app.get(
    "/customers",
    {
      schema: {
        summary: "Lookup customers",
        operationId: "lookupCustomers",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.CUSTOMERS_LOOKUP, PERMISSIONS.CUSTOMERS_READ],
        querystring: CustomerLookupQuery,
        response: {
          200: dataResponse(z.array(CustomerLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.customers(request.query) }),
  );

  app.get(
    "/vehicles",
    {
      schema: {
        summary: "Lookup vehicles",
        operationId: "lookupVehicles",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.REFERENCE_DATA_LOOKUP, PERMISSIONS.VEHICLES_READ],
        querystring: VehicleLookupQuery,
        response: {
          200: dataResponse(z.array(VehicleLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.vehicles(request.query) }),
  );

  app.get(
    "/users",
    {
      schema: {
        summary: "Lookup users",
        operationId: "lookupUsers",
        tags: ["Lookups"],
        permissions: [PERMISSIONS.USERS_LOOKUP, PERMISSIONS.USERS_READ],
        querystring: UserLookupQuery,
        response: { 200: dataResponse(z.array(UserLookupItem)), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await lookups.users(request.query) }),
  );

  app.get(
    "/roles",
    {
      schema: {
        summary: "Lookup roles",
        operationId: "lookupRoles",
        tags: ["Lookups"],
        // Assigning roles to a user needs users.create/update; roles.read holders
        // keep working. No dedicated roles.lookup exists.
        permissions: [PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_UPDATE],
        querystring: RoleLookupQuery,
        response: { 200: dataResponse(z.array(RoleLookupItem)), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await lookups.roles(request.query) }),
  );

  app.get(
    "/purchase-experiences",
    {
      schema: {
        summary: "Lookup purchase experiences",
        operationId: "lookupPurchaseExperiences",
        tags: ["Lookups"],
        // A complaint creator picks a purchase experience without full PE read.
        permissions: [PERMISSIONS.PURCHASE_EXPERIENCES_READ, PERMISSIONS.COMPLAINTS_CREATE],
        querystring: PurchaseExperienceLookupQuery,
        response: {
          200: dataResponse(z.array(PurchaseExperienceLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.purchaseExperiences(request.query) }),
  );

  app.get(
    "/communication-templates",
    {
      schema: {
        summary: "Lookup published communication templates",
        operationId: "lookupCommunicationTemplates",
        tags: ["Lookups"],
        permissions: [
          PERMISSIONS.COMMUNICATION_TEMPLATES_LOOKUP,
          PERMISSIONS.COMMUNICATION_TEMPLATES_READ,
        ],
        querystring: CommunicationTemplateLookupQuery,
        response: {
          200: dataResponse(z.array(CommunicationTemplateLookupItem)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await lookups.communicationTemplates(request.query) }),
  );
}
