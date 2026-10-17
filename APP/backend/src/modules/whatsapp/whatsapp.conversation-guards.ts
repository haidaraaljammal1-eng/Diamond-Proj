import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";

export function assertDirectConversation(conversation: { kind?: string }): void {
  if (conversation.kind === "GROUP") {
    throw whatsappError.groupCustomerOperationsForbidden();
  }
}
