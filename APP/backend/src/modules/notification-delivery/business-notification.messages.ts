import { env } from "src/config/env";

export interface BusinessActor {
  label: string;
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
  customerName: string;
  vehicleName: string | null;
  amount: number;
  currency: string;
  paymentSource: string;
  occurredAt: Date;
}

export interface PaymentFailedMessageInput {
  contractNumber: string;
  customerName: string;
  vehicleName: string | null;
  amount: number;
  currency: string;
  purposeLabel: string;
  occurredAt: Date;
}

export interface CarOutMessageInput {
  contractNumber: string;
  vehicleName: string;
  customerName: string;
  mileageOut: number;
  fuelOut: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface RentalExtendedMessageInput {
  contractNumber: string;
  vehicleName: string;
  customerName: string;
  previousEndAt: Date;
  newEndAt: Date;
  additionalAmount: number | null;
  currency: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface CarInMessageInput {
  contractNumber: string;
  vehicleName: string;
  customerName: string;
  mileageIn: number;
  fuelIn: string;
  damageSummary: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface RoadLiabilityReceivedMessageInput {
  vehicleName: string | null;
  customerName: string | null;
  contractNumber: string | null;
  reference: string;
  officialAmount: number | null;
  adminFee: number | null;
  totalDue: number | null;
  currency: string;
  source: string;
  occurredAt: Date;
}

export interface RoadLiabilityCollectedMessageInput {
  vehicleName: string | null;
  customerName: string;
  contractNumber: string;
  reference: string;
  officialAmount: number;
  adminFee: number;
  totalCollected: number;
  currency: string;
  collectionChannel: string;
  occurredAt: Date;
}

export interface RoadLiabilityCollectionFailedMessageInput {
  contractNumber: string;
  customerName: string;
  vehicleName: string | null;
  reference: string | null;
  amount: number;
  currency: string;
  purposeLabel: string;
  occurredAt: Date;
}

export interface MaintenanceStartedMessageInput {
  vehicleName: string;
  orderReference: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface MaintenanceCompletedMessageInput {
  vehicleName: string;
  orderReference: string;
  actualCost: number | null;
  currency: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface ManualExpenseMessageInput {
  category: string;
  description: string;
  amount: number;
  currency: string;
  actor: BusinessActor;
  occurredAt: Date;
}

export interface AttentionSummaryMessageInput {
  unpaidContractsCount: number;
  unpaidContractsTotal: number;
  unpaidRoadLiabilitiesCount: number;
  unpaidRoadLiabilitiesTotal: number;
  overdueRentalsCount: number;
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

function formatDate(value: Date, timeZone = env.ATTENTION_MONITOR_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    dateStyle: "medium",
  }).format(value);
}

export function buildContractSignedMessage(input: ContractSignedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "📝 Contract Signed",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      `Customer: ${input.customerName}`,
      `Amount Due: ${formatMoney(input.amountDue, input.currency)}`,
      `By: ${input.actor.label}`,
      `Payment: ${input.paymentState}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildPaymentReceivedMessage(input: PaymentReceivedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "💳 Payment Received",
      `Contract: ${input.contractNumber}`,
      `Customer: ${input.customerName}`,
      ...(input.vehicleName ? [`Vehicle: ${input.vehicleName}`] : []),
      `Amount Collected: ${formatMoney(input.amount, input.currency)}`,
      `Payment Source: ${input.paymentSource}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildPaymentFailedMessage(input: PaymentFailedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "⚠️ Contract Payment Failed",
      `Contract: ${input.contractNumber}`,
      `Customer: ${input.customerName}`,
      ...(input.vehicleName ? [`Vehicle: ${input.vehicleName}`] : []),
      `Amount: ${formatMoney(input.amount, input.currency)}`,
      `Purpose: ${input.purposeLabel}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildCarOutMessage(input: CarOutMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "🚗 Car-Out Completed",
      `Vehicle: ${input.vehicleName}`,
      `Customer: ${input.customerName}`,
      `Contract: ${input.contractNumber}`,
      `Mileage OUT: ${input.mileageOut}`,
      `Fuel OUT: ${input.fuelOut}`,
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildRentalExtendedMessage(input: RentalExtendedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "📅 Rental Extended",
      `Vehicle: ${input.vehicleName}`,
      `Customer: ${input.customerName}`,
      `Contract: ${input.contractNumber}`,
      `Old End: ${formatDate(input.previousEndAt)}`,
      `New End: ${formatDate(input.newEndAt)}`,
      ...(input.additionalAmount != null
        ? [`Additional Amount: ${formatMoney(input.additionalAmount, input.currency)}`]
        : []),
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildCarInMessage(input: CarInMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "🚗 Vehicle Returned",
      `Contract: ${input.contractNumber}`,
      `Vehicle: ${input.vehicleName}`,
      `Customer: ${input.customerName}`,
      `Mileage IN: ${input.mileageIn.toLocaleString("en-US")} km`,
      `Fuel IN: ${input.fuelIn}`,
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildRoadLiabilityReceivedMessage(input: RoadLiabilityReceivedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "🚦 Road Liability Received",
      ...(input.vehicleName ? [`Vehicle: ${input.vehicleName}`] : []),
      ...(input.customerName ? [`Customer: ${input.customerName}`] : []),
      ...(input.contractNumber ? [`Contract: ${input.contractNumber}`] : []),
      `Reference: ${input.reference}`,
      ...(input.officialAmount != null
        ? [`Official Amount: ${formatMoney(input.officialAmount, input.currency)}`]
        : []),
      ...(input.adminFee != null ? [`Admin Fee: ${formatMoney(input.adminFee, input.currency)}`] : []),
      ...(input.totalDue != null ? [`Total Due: ${formatMoney(input.totalDue, input.currency)}`] : []),
      `Source: ${input.source}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildRoadLiabilityCollectedMessage(input: RoadLiabilityCollectedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "✅ Road Liability Collected",
      ...(input.vehicleName ? [`Vehicle: ${input.vehicleName}`] : []),
      `Customer: ${input.customerName}`,
      `Contract: ${input.contractNumber}`,
      `Reference: ${input.reference}`,
      `Official Amount: ${formatMoney(input.officialAmount, input.currency)}`,
      `Admin Fee: ${formatMoney(input.adminFee, input.currency)}`,
      `Total Collected: ${formatMoney(input.totalCollected, input.currency)}`,
      `Collection Channel: ${input.collectionChannel}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildRoadLiabilityCollectionFailedMessage(input: RoadLiabilityCollectionFailedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "❌ Road Liability Collection Failed",
      `Contract: ${input.contractNumber}`,
      `Customer: ${input.customerName}`,
      ...(input.vehicleName ? [`Vehicle: ${input.vehicleName}`] : []),
      ...(input.reference ? [`Reference: ${input.reference}`] : []),
      `Amount: ${formatMoney(input.amount, input.currency)}`,
      `Purpose: ${input.purposeLabel}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildMaintenanceStartedMessage(input: MaintenanceStartedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "🔧 Maintenance Started",
      `Vehicle: ${input.vehicleName}`,
      `Order: ${input.orderReference}`,
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildMaintenanceCompletedMessage(input: MaintenanceCompletedMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "✅ Maintenance Completed",
      `Vehicle: ${input.vehicleName}`,
      `Order: ${input.orderReference}`,
      ...(input.actualCost != null
        ? [`Actual Cost: ${formatMoney(input.actualCost, input.currency)}`]
        : []),
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildManualExpenseMessage(input: ManualExpenseMessageInput) {
  return {
    title: "Diamond Rent Car",
    message: [
      "💸 Manual Expense Created",
      `Category: ${input.category}`,
      `Description: ${input.description}`,
      `Amount: ${formatMoney(input.amount, input.currency)}`,
      `By: ${input.actor.label}`,
      `Time: ${formatDateTime(input.occurredAt)}`,
    ].join("\n"),
  };
}

export function buildAttentionSummaryMessage(input: AttentionSummaryMessageInput) {
  const lines = ["⚠️ Diamond Attention Required", ""];

  if (input.unpaidContractsCount > 0) {
    lines.push(
      "Unpaid contracts:",
      `${input.unpaidContractsCount} — ${formatMoney(input.unpaidContractsTotal, input.currency)}`,
      "",
    );
  }

  if (input.unpaidRoadLiabilitiesCount > 0) {
    lines.push(
      "Unpaid traffic liabilities:",
      `${input.unpaidRoadLiabilitiesCount} — ${formatMoney(input.unpaidRoadLiabilitiesTotal, input.currency)}`,
      "",
    );
  }

  if (input.overdueRentalsCount > 0) {
    lines.push("Overdue rentals:", `${input.overdueRentalsCount}`, "");
  }

  if (input.outstandingFinancialTotal > 0) {
    lines.push(
      "Outstanding financial total:",
      formatMoney(input.outstandingFinancialTotal, input.currency),
    );
  }

  return {
    title: "Diamond Rent Car",
    message: lines.join("\n").trim(),
  };
}
