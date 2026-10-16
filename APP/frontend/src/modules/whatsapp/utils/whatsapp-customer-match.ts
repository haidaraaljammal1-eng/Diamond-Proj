import { getWhatsAppCustomerMatch } from "../api/whatsapp.api";
import { createCustomerMatchLoader } from "./whatsapp-customer-match-cache";

export const whatsappCustomerMatch = createCustomerMatchLoader(getWhatsAppCustomerMatch);
