/**
 * Central registry of ALLOWED template variables. No arbitrary placeholders are
 * permitted — save/validate/publish reject any `{{key}}` not listed here. The
 * internal `key` is stable and never translated; the UI shows the localized label.
 * Syntax is fixed: `{{key}}` (see PLACEHOLDER_RE).
 */

import type { CommunicationChannel } from "@prisma/client";

export interface TemplateVariableDef {
  key: string;
  labelEn: string;
  labelAr: string;
  description: string;
  channels: CommunicationChannel[];
  example: string;
}

const ALL: CommunicationChannel[] = ["EMAIL", "WHATSAPP", "SMS"];

export const TEMPLATE_VARIABLES: readonly TemplateVariableDef[] = [
  { key: "customer_name", labelEn: "Customer name", labelAr: "اسم العميل", description: "The customer's name", channels: ALL, example: "Ahmed Al-Otaibi" },
  { key: "vehicle_model", labelEn: "Vehicle model", labelAr: "موديل السيارة", description: "The vehicle model name", channels: ALL, example: "Attrage" },
  { key: "vehicle_year", labelEn: "Vehicle year", labelAr: "سنة الصنع", description: "The vehicle model year", channels: ALL, example: "2024" },
  { key: "vehicle_vin", labelEn: "Vehicle VIN", labelAr: "رقم الهيكل", description: "The vehicle VIN / chassis number", channels: ALL, example: "JN1AZ4EH8DM123456" },
  { key: "branch_name", labelEn: "Branch name", labelAr: "اسم الفرع", description: "The branch name", channels: ALL, example: "Riyadh 1" },
  { key: "salesperson_name", labelEn: "Salesperson name", labelAr: "اسم مندوب المبيعات", description: "The salesperson's name", channels: ALL, example: "Sara" },
  { key: "purchase_date", labelEn: "Purchase date", labelAr: "تاريخ الشراء", description: "The purchase date", channels: ALL, example: "2026-03-01" },
  { key: "delivery_date", labelEn: "Delivery date", labelAr: "تاريخ التسليم", description: "The delivery date", channels: ALL, example: "2026-03-05" },
  { key: "link_title", labelEn: "Link title", labelAr: "عنوان الرابط", description: "The title of the action the link opens", channels: ALL, example: "Your request" },
  { key: "action_link", labelEn: "Action link", labelAr: "رابط الإجراء", description: "The secure, recipient-specific action link", channels: ALL, example: "https://app.example.com/a/AbC123" },
  { key: "customer_external_id", labelEn: "Customer external ID", labelAr: "المعرّف الخارجي للعميل", description: "The customer's ERP external id", channels: ALL, example: "CUST-1001" },
  { key: "sale_external_id", labelEn: "Sale external ID", labelAr: "معرّف عملية البيع", description: "The external sale id", channels: ALL, example: "SALE-5001" },
] as const;

export const ACTION_LINK_VARIABLE = "action_link";

const BY_KEY = new Map(TEMPLATE_VARIABLES.map((v) => [v.key, v]));

export function getVariable(key: string): TemplateVariableDef | undefined {
  return BY_KEY.get(key);
}

export function variableSupportsChannel(key: string, channel: CommunicationChannel): boolean {
  const v = BY_KEY.get(key);
  return !!v && v.channels.includes(channel);
}

/** Sample render context using each variable's example value. */
export function sampleContext(): Record<string, string> {
  return Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.example]));
}
