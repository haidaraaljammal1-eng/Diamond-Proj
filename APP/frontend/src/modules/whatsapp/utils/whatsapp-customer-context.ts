import { getWhatsAppCustomerContext } from "../api/whatsapp.api";
import { createCustomerContextLoader } from "./whatsapp-customer-context-cache";

export const whatsappCustomerContext = createCustomerContextLoader(getWhatsAppCustomerContext);
