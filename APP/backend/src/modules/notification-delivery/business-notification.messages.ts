import { env } from "src/config/env";

/** Staff login identifier — sourced from `User.email` (canonical account identity). */
export interface BusinessActor {
  staffUsername: string;
}

function pushoverTitle(): string {
  return env.PUSHOVER_NOTIFICATION_TITLE;
}

function blockLines(lines: string[]): string {
  return lines.filter((line) => line.length > 0).join("\n");
}

function byLine(actor: BusinessActor): string[] {
  const u = actor.staffUsername.trim();
  if (u.length === 0 || u === "—") return [];
  return [`By: ${u}`];
}

export interface ContractSignedMessageInput {
  contractNumber: string;
  vehicleName: string;
  customerName: string;
  amountDue: number;
  currency: string;
  actor: BusinessActor;
  paymentState: string;
  occurredAt: Date;
}

export interface PaymentReceivedMessageInput {
  contractNumber: string;
  vehicleName: string | null;
  actor: BusinessActor;
}

export interface PaymentFailedMessageInput {
  contractNumber: string;
  vehicleName: string | null;
  actor: BusinessActor;
}

export interface PaymentAuthorizationIncompleteMessageInput {
  contractNumber: string;
  vehicleName: string | null;
  actor: BusinessActor;
}

export interface CarOutMessageInput {
  contractNumber: string;
  vehicleName: string;
  actor: BusinessActor;
}

export interface RentalExtendedMessageInput {
  contractNumber: string;
  vehicleName: string;
  actor: BusinessActor;
}

export interface CarInMessageInput {
  contractNumber: string;
  vehicleName: string;
  actor: BusinessActor;
}

export interface RoadLiabilityReceivedMessageInput {
  /** Prisma `RoadLiability.type` — used to distinguish Salik from traffic. */
  liabilityType: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
  contractNumber: string | null;
  vehicleName: string | null;
  staffActor?: BusinessActor | null;
}

function isSalikLiabilityType(
  type: RoadLiabilityReceivedMessageInput["liabilityType"],
): boolean {
  return type === "SALIK_TOLL" || type === "SALIK_VIOLATION";
}

export interface RoadLiabilityCollectedMessageInput {
  contractNumber: string;
  vehicleName: string | null;
  actor: BusinessActor;
}

export interface RoadLiabilityCollectionFailedMessageInput {
  contractNumber: string;
  vehicleName: string | null;
  actor: BusinessActor;
}

export interface MaintenanceStartedMessageInput {
  vehicleName: string;
  actor: BusinessActor;
}

export interface MaintenanceScheduleMissedMessageInput {
  vehicleName: string;
}

export interface MaintenanceDelayedMessageInput {
  vehicleName: string;
}

export interface MaintenanceCompletedMessageInput {
  vehicleName: string;
  actor: BusinessActor;
}

export interface ManualExpenseMessageInput {
  actor: BusinessActor;
}

export interface ContractFleetReturnMessageInput {
  contractNumber: string;
  vehicleName: string;
  actor: BusinessActor;
}

export interface OverdueRentalReminderInput {
  contractNumber: string;
  vehicleName: string;
}

/** @deprecated Demo / legacy — attention monitor sends a fixed summary line only. */
export interface AttentionSummaryMessageInput {
  unpaidContractsCount: number;
  unpaidContractsTotal: number;
  unpaidDeferredViolationsCount: number;
  unpaidDeferredViolationsTotal: number;
  unpaidPostCloseViolationsCount: number;
  unpaidPostCloseViolationsTotal: number;
  awaitingRenewalsCount: number;
  awaitingRenewalsTotal: number;
  outstandingFinancialTotal: number;
  currency: string;
}

function formatMoney(amount: number, currency = "AED"): string {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function formatDateTime(value: Date, timeZone = env.ATTENTION_MONITOR_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function buildContractSignedMessage(input: ContractSignedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Event: Contract signed",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      `Customer: ${input.customerName}`,
      `Amount due: ${formatMoney(input.amountDue, input.currency)}`,
      `Payment state: ${input.paymentState}`,
      `When: ${formatDateTime(input.occurredAt)}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildPaymentReceivedMessage(input: PaymentReceivedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Payment confirmed successfully.",
      `Contract: ${input.contractNumber}`,
      ...(input.vehicleName != null && input.vehicleName.trim() !== ""
        ? [`Vehicle: ${input.vehicleName}`]
        : []),
      ...byLine(input.actor),
    ]),
  };
}

export function buildPaymentAuthorizationIncompleteMessage(
  input: PaymentAuthorizationIncompleteMessageInput,
) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Card authorization incomplete.",
      `Contract: ${input.contractNumber}`,
      ...(input.vehicleName != null && input.vehicleName.trim() !== ""
        ? [`Vehicle: ${input.vehicleName}`]
        : []),
      ...byLine(input.actor),
    ]),
  };
}

export function buildPaymentFailedMessage(input: PaymentFailedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Payment failed.",
      `Contract: ${input.contractNumber}`,
      ...(input.vehicleName != null && input.vehicleName.trim() !== ""
        ? [`Vehicle: ${input.vehicleName}`]
        : []),
      ...byLine(input.actor),
    ]),
  };
}

export function buildCarOutMessage(input: CarOutMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Vehicle handed over successfully.",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildRentalExtendedMessage(input: RentalExtendedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Rental extended successfully.",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildCarInMessage(input: CarInMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Vehicle return submitted for review.",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildRoadLiabilityReceivedMessage(input: RoadLiabilityReceivedMessageInput) {
  const salik = isSalikLiabilityType(input.liabilityType);
  const lines: string[] = [salik ? "New Salik recorded." : "New road liability recorded."];
  if (input.contractNumber != null && input.contractNumber.trim() !== "") {
    lines.push(`Contract: ${input.contractNumber}`);
  }
  if (input.vehicleName != null && input.vehicleName.trim() !== "") {
    lines.push(`Vehicle: ${input.vehicleName}`);
  }
  if (input.staffActor) {
    lines.push(...byLine(input.staffActor));
  }
  return {
    // Traffic keeps the shared brand title + existing body headline unchanged.
    // Salik only: event-specific title + body headline.
    title: salik ? "New Salik Recorded" : pushoverTitle(),
    message: blockLines(lines),
  };
}

export function buildRoadLiabilityCollectedMessage(input: RoadLiabilityCollectedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Payment confirmed successfully.",
      `Contract: ${input.contractNumber}`,
      ...(input.vehicleName != null && input.vehicleName.trim() !== ""
        ? [`Vehicle: ${input.vehicleName}`]
        : []),
      ...byLine(input.actor),
    ]),
  };
}

export function buildRoadLiabilityCollectionFailedMessage(input: RoadLiabilityCollectionFailedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Payment failed.",
      `Contract: ${input.contractNumber}`,
      ...(input.vehicleName != null && input.vehicleName.trim() !== ""
        ? [`Vehicle: ${input.vehicleName}`]
        : []),
      ...byLine(input.actor),
    ]),
  };
}

export function buildMaintenanceStartedMessage(input: MaintenanceStartedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines(["Maintenance started.", `Vehicle: ${input.vehicleName}`, ...byLine(input.actor)]),
  };
}

export function buildMaintenanceScheduleMissedMessage(input: MaintenanceScheduleMissedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Scheduled maintenance has not started.",
      `Vehicle: ${input.vehicleName}`,
    ]),
  };
}

export function buildMaintenanceDelayedMessage(input: MaintenanceDelayedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines(["Maintenance completion is overdue.", `Vehicle: ${input.vehicleName}`]),
  };
}

export function buildMaintenanceCompletedMessage(input: MaintenanceCompletedMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Maintenance completed.",
      `Vehicle: ${input.vehicleName}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildManualExpenseMessage(input: ManualExpenseMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines(["New expense recorded.", ...byLine(input.actor)]),
  };
}

export function buildContractFleetReturnMessage(input: ContractFleetReturnMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Contract closed successfully.",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      ...byLine(input.actor),
    ]),
  };
}

export function buildOverdueRentalReminderMessage(input: OverdueRentalReminderInput) {
  return {
    title: pushoverTitle(),
    message: blockLines([
      "Vehicle return is overdue.",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
    ]),
  };
}

export function buildOpenReceivablesReminderMessage() {
  return {
    title: pushoverTitle(),
    message: blockLines(["Pending receivables require review."]),
  };
}

export function buildAttentionSummaryMessage(_input?: AttentionSummaryMessageInput) {
  return {
    title: pushoverTitle(),
    message: blockLines(["Outstanding items require attention."]),
  };
}

export interface DailyOperationsDigestMessageInput {
  unpaidRentalsCount: number;
  unpaidRenewalsCount: number;
  trafficViolationsCount: number;
  salikCount: number;
  reconciliationCount: number;
  postCloseReceivablesCount: number;
  overdueVehicleReturnsCount: number;
  scheduledMaintenanceNotStartedCount: number;
  maintenanceCompletionDelayedCount: number;
}

/** Unified scheduled digest — counts only; no PII / contract / vehicle lines. */
export function buildDailyOperationsDigestMessage(input: DailyOperationsDigestMessageInput) {
  const total =
    input.unpaidRentalsCount +
    input.unpaidRenewalsCount +
    input.trafficViolationsCount +
    input.salikCount +
    input.reconciliationCount +
    input.postCloseReceivablesCount +
    input.overdueVehicleReturnsCount +
    input.scheduledMaintenanceNotStartedCount +
    input.maintenanceCompletionDelayedCount;

  return {
    title: pushoverTitle(),
    message: blockLines([
      "Daily Operations & Receivables",
      "",
      "FINANCIAL RECEIVABLES",
      `- Unpaid Rentals: ${input.unpaidRentalsCount}`,
      `- Unpaid Renewals: ${input.unpaidRenewalsCount}`,
      `- Traffic Violations: ${input.trafficViolationsCount}`,
      `- Salik: ${input.salikCount}`,
      `- Reconciliation: ${input.reconciliationCount}`,
      `- Post-Close Receivables: ${input.postCloseReceivablesCount}`,
      "",
      "OVERDUE VEHICLE RETURNS",
      `- Vehicles Awaiting Return: ${input.overdueVehicleReturnsCount}`,
      "",
      "MAINTENANCE OVERDUE",
      `- Scheduled Maintenance Not Started: ${input.scheduledMaintenanceNotStartedCount}`,
      `- Maintenance Completion Delayed: ${input.maintenanceCompletionDelayedCount}`,
      "",
      `Total Outstanding Items: ${total}`,
    ]),
  };
}
