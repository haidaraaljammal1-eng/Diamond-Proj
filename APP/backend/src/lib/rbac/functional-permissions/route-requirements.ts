import { FN } from "./keys";
import type { FunctionalRouteRequirement } from "./enforcement";

function all(...keys: string[]): FunctionalRouteRequirement {
  return { keys, requireAll: true };
}

function any(...keys: string[]): FunctionalRouteRequirement {
  return { keys, requireAll: false };
}

/** Reference master-data pickers for authorized workflows (not page-wide read). */
const REFERENCE_LOOKUP_WORKFLOWS = any(
  FN.contracts.rentalLink,
  FN.maintenance.create,
  FN.vehicles.addDelete,
);

/**
 * Maps OpenAPI `operationId` → functional capability requirements when V2 is enabled.
 * Legacy `schema.permissions` is ignored for mapped routes under V2.
 */
export const ROUTE_FUNCTIONAL_REQUIREMENTS: Readonly<
  Record<string, FunctionalRouteRequirement>
> = {
  // Dashboard
  getDashboardOverview: all(FN.dashboard.full),

  // Vehicles
  listVehicles: all(FN.vehicles.viewPage),
  listVehicleFilterOptions: all(FN.vehicles.viewPage),
  getVehicle: all(FN.vehicles.viewPage),
  streamVehiclePhoto: all(FN.vehicles.viewPage),
  createVehicle: all(FN.vehicles.addDelete),
  deactivateVehicle: all(FN.vehicles.addDelete),
  reactivateVehicle: all(FN.vehicles.addDelete),
  uploadVehiclePhoto: all(FN.vehicles.addDelete),
  deleteVehiclePhoto: all(FN.vehicles.addDelete),
  updateVehicle: all(FN.vehicles.editPrices),

  // GPS
  getGpsVehicleHealth: all(FN.gps.full),
  getGpsVehicleMileageSummary: all(FN.gps.full),
  getGpsVehicleOverspeed: all(FN.gps.full),
  getGpsSummary: all(FN.gps.full),
  listGpsVehicles: all(FN.gps.full),
  listGpsMapPoints: all(FN.gps.full),
  getGpsVehicleHistory: all(FN.gps.full),
  getGpsVehicle: all(FN.gps.full),
  streamGpsRealtime: all(FN.gps.full),

  // Maintenance
  listMaintenanceOrders: all(FN.maintenance.viewPage),
  getMaintenanceSummary: all(FN.maintenance.viewPage),
  getMaintenanceOrder: all(FN.maintenance.viewPage),
  createMaintenanceOrder: all(FN.maintenance.create),
  updateMaintenanceOrder: all(FN.maintenance.manageLifecycle),
  startMaintenanceOrder: all(FN.maintenance.manageLifecycle),
  readyMaintenanceOrder: all(FN.maintenance.manageLifecycle),
  completeMaintenanceOrder: all(FN.maintenance.manageLifecycle),
  cancelMaintenanceOrder: all(FN.maintenance.manageLifecycle),

  // Archive
  exportArchiveWorkbook: all(FN.archive.full),
  listArchiveVehicles: all(FN.archive.full),
  listArchiveRows: all(FN.archive.full),
  createArchiveRow: all(FN.archive.full),
  updateArchiveRow: all(FN.archive.full),
  deleteArchiveRow: all(FN.archive.full),
  previewArchiveImport: all(FN.archive.full),
  confirmArchiveImport: all(FN.archive.full),
  getArchiveSyncStatus: all(FN.archive.full),
  syncArchive: all(FN.archive.full),
  restoreArchiveChargeField: all(FN.archive.full),

  // Violations / road liabilities
  getRoadLiabilitiesSummary: all(FN.violations.viewPage),
  listRoadLiabilities: all(FN.violations.viewPage),
  getRoadLiability: all(FN.violations.viewPage),
  getRoadLiabilityCollection: all(FN.violations.viewPage),
  getRoadLiabilityCustomerCharge: all(FN.violations.reviewDues),
  confirmRoadLiabilityCustomerCharge: all(FN.violations.collectCharges),
  collectRoadLiabilityOffSession: all(FN.violations.collectCharges),
  createRoadLiabilityPaymentLink: all(FN.violations.collectCharges),
  startRoadLiabilityManualCollection: all(FN.violations.collectCharges),
  confirmRoadLiabilityCashCollection: all(FN.violations.collectCharges),
  confirmRoadLiabilityManualCollection: all(FN.violations.collectCharges),
  listReturnedContractsForRoadCharges: all(FN.violations.viewPage),
  staffManualChargeReturnedContract: all(FN.violations.collectCharges),

  // Finance
  getFinanceSummary: all(FN.finance.viewPage),
  getFinanceAnalytics: all(FN.finance.viewPage),
  listFinanceLedger: all(FN.finance.viewPage),
  listFinanceOpenReceivables: all(FN.finance.viewPage),
  getFinanceStatementBusinessToday: all(FN.finance.viewPage),
  downloadFinanceStatementPdf: all(FN.finance.viewPage),
  createManualExpense: all(FN.finance.addExpense),
  getManualExpense: all(FN.finance.viewPage),
  voidManualExpense: all(FN.finance.voidExpense),
  correctManualExpense: all(FN.finance.correctExpense),

  // Invoices
  listInvoices: all(FN.invoices.viewPage),
  getInvoice: all(FN.invoices.viewPage),
  listInvoiceDeliveries: all(FN.invoices.viewPage),
  getInvoicePdf: all(FN.invoices.downloadPdf),
  sendInvoiceWhatsApp: all(FN.invoices.sendWhatsapp),

  // Contracts — view
  listContracts: all(FN.contracts.viewPage),
  getContract: all(FN.contracts.viewPage),
  getContractTarsState: all(FN.contracts.viewPage),
  streamStaffOfficialContractSignature: all(FN.contracts.viewPage),
  getContractCarOut: all(FN.contracts.viewPage),
  streamContractCarOutSignature: all(FN.contracts.viewPage),
  streamContractCarOutPhoto: all(FN.contracts.viewPage),
  getContractCarIn: all(FN.contracts.viewPage),
  streamContractCarInSignature: all(FN.contracts.viewPage),
  streamContractCarInPhoto: all(FN.contracts.viewPage),
  getContractFullReconciliation: all(FN.contracts.viewPage),

  // Rental link workflow
  createContractOffer: all(FN.contracts.rentalLink),
  updateOfficialContractTerms: all(FN.contracts.rentalLink),
  generateContractRentalLink: all(FN.contracts.rentalLink),
  deletePendingRentalRequest: all(FN.contracts.rentalLink),

  // Delivery / return / reconciliation
  contractCarOut: all(FN.contracts.deliveryReturnReconcile),
  saveContractCarOutDraft: all(FN.contracts.deliveryReturnReconcile),
  uploadContractCarOutPhoto: all(FN.contracts.deliveryReturnReconcile),
  deleteContractCarOutPhoto: all(FN.contracts.deliveryReturnReconcile),
  uploadContractCarOutSignature: all(FN.contracts.deliveryReturnReconcile),
  completeContractCarOut: all(FN.contracts.deliveryReturnReconcile),
  generateContractReturnLink: all(FN.contracts.deliveryReturnReconcile),
  startContractReturnStaff: all(FN.contracts.deliveryReturnReconcile),
  saveContractCarInDraft: all(FN.contracts.deliveryReturnReconcile),
  uploadContractCarInPhoto: all(FN.contracts.deliveryReturnReconcile),
  deleteContractCarInPhoto: all(FN.contracts.deliveryReturnReconcile),
  uploadContractCarInSignature: all(FN.contracts.deliveryReturnReconcile),
  completeContractCarIn: all(FN.contracts.deliveryReturnReconcile),
  contractCarIn: all(FN.contracts.deliveryReturnReconcile),
  reconcileContract: all(FN.contracts.deliveryReturnReconcile),
  addContractReconciliationLine: all(FN.contracts.deliveryReturnReconcile),
  updateContractReconciliationLine: all(FN.contracts.deliveryReturnReconcile),
  deleteContractReconciliationLine: all(FN.contracts.deliveryReturnReconcile),
  finalizeContractReconciliation: all(FN.contracts.deliveryReturnReconcile),
  listContractReconciliationRoadLiabilities: all(FN.contracts.deliveryReturnReconcile),
  confirmContractRoadLiabilityCharge: all(FN.contracts.deliveryReturnReconcile),

  // Collection & closure (not post-close receivable payment)
  settleContractReconciliationCash: all(FN.contracts.collectionClosure),
  generateContractReconciliationLink: all(FN.contracts.collectionClosure),
  startReconciliationPayment: all(FN.contracts.collectionClosure),
  closeContract: all(FN.contracts.collectionClosure),
  confirmContractPayment: all(FN.contracts.collectionClosure),

  startPostCloseReceivablePayment: all(FN.violations.collectCharges),

  // Renewal
  generateContractRenewalLink: all(FN.contracts.renewal),
  settleContractRenewalCash: all(FN.contracts.renewal),
  renewContract: all(FN.contracts.renewal),

  // Users
  listUsers: all(FN.users.viewPage),
  getUser: all(FN.users.viewPage),
  createUser: all(FN.users.create),
  updateUser: all(FN.users.edit),
  userDepartmentOptions: any(FN.users.create, FN.users.edit),
  setUserStatus: all(FN.users.enableDisable),
  setUserRoles: all(FN.users.assignRoles),
  setUserBranches: all(FN.users.edit),
  setUserDepartments: all(FN.users.edit),
  deleteUser: all(FN.users.delete),

  // Roles
  listRoles: all(FN.roles.viewPage),
  getRole: all(FN.roles.viewPage),
  listPermissions: all(FN.roles.viewPage),
  createRole: all(FN.roles.createEdit),
  updateRole: all(FN.roles.createEdit),
  setRolePermissions: all(FN.roles.managePermissions),

  // WhatsApp
  getWhatsAppConnection: all(FN.whatsapp.full),
  getWhatsAppConnectionQr: all(FN.whatsapp.full),
  bootstrapWhatsAppConnection: all(FN.whatsapp.full),
  startWhatsAppConnectionAttempt: all(FN.whatsapp.full),
  authorizeWhatsAppConnectionAttempt: all(FN.whatsapp.full),
  selectWhatsAppConnection: all(FN.whatsapp.full),
  disconnectWhatsAppConnection: all(FN.whatsapp.full),
  activateWhatsAppWebhook: all(FN.whatsapp.full),
  configureWhapiConnection: all(FN.whatsapp.full),
  streamWhatsAppRealtime: all(FN.whatsapp.full),
  getWhatsAppMessageMedia: all(FN.whatsapp.full),
  listWhatsAppTemplates: all(FN.whatsapp.full),
  listWhatsAppConversations: all(FN.whatsapp.full),
  getWhatsAppConversation: all(FN.whatsapp.full),
  listWhatsAppMessages: all(FN.whatsapp.full),
  markWhatsAppConversationRead: all(FN.whatsapp.full),
  sendWhatsAppTextMessage: all(FN.whatsapp.full),
  sendWhatsAppTemplateMessage: all(FN.whatsapp.full),
  sendWhatsAppMediaMessage: all(FN.whatsapp.full),
  getWhatsAppCustomerMatch: all(FN.whatsapp.full),
  getWhatsAppCustomerContext: all(FN.whatsapp.full),
  linkWhatsAppConversationCustomer: all(FN.whatsapp.full),
  unlinkWhatsAppConversationCustomer: all(FN.whatsapp.full),

  setRoleFunctionalGrants: all(FN.roles.managePermissions),

  // Contextual lookups (V2 — no broad legacy bypass)
  lookupRegions: REFERENCE_LOOKUP_WORKFLOWS,
  lookupCities: REFERENCE_LOOKUP_WORKFLOWS,
  lookupBranches: REFERENCE_LOOKUP_WORKFLOWS,
  lookupVehicleModels: REFERENCE_LOOKUP_WORKFLOWS,
  lookupDepartments: REFERENCE_LOOKUP_WORKFLOWS,
  lookupSalespeople: REFERENCE_LOOKUP_WORKFLOWS,
  lookupCustomers: any(FN.contracts.rentalLink, FN.whatsapp.full),
  lookupVehicles: any(
    FN.maintenance.create,
    FN.maintenance.manageLifecycle,
    FN.contracts.rentalLink,
    FN.vehicles.viewPage,
    FN.vehicles.addDelete,
  ),
  lookupRoles: any(FN.users.create, FN.users.assignRoles),
};

export function resolveRouteFunctionalRequirement(
  operationId: string,
): FunctionalRouteRequirement | undefined {
  return ROUTE_FUNCTIONAL_REQUIREMENTS[operationId];
}
