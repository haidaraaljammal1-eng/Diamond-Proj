export type RoadLiabilityStripeFailureCode =
  | "insufficient_funds"
  | "card_declined"
  | "expired_card"
  | "do_not_honor"
  | "incorrect_cvc"
  | "authentication_required"
  | "processing_error"
  | "generic_decline";

export interface LocalizedFailureMessage {
  reasonCode: RoadLiabilityStripeFailureCode;
  messageEn: string;
  messageAr: string;
}

const MESSAGES: Record<RoadLiabilityStripeFailureCode, Omit<LocalizedFailureMessage, "reasonCode">> = {
  insufficient_funds: {
    messageEn: "The card has insufficient funds.",
    messageAr: "الرصيد غير كافٍ على البطاقة.",
  },
  card_declined: {
    messageEn: "The card was declined.",
    messageAr: "تم رفض البطاقة.",
  },
  expired_card: {
    messageEn: "The card has expired.",
    messageAr: "انتهت صلاحية البطاقة.",
  },
  do_not_honor: {
    messageEn: "The bank declined this charge (do not honor).",
    messageAr: "رفض البنك هذا التحصيل.",
  },
  incorrect_cvc: {
    messageEn: "The card security code was incorrect.",
    messageAr: "رمز الأمان للبطاقة غير صحيح.",
  },
  authentication_required: {
    messageEn: "This card requires customer authentication and cannot be charged off-session.",
    messageAr: "تتطلب هذه البطاقة مصادقة العميل ولا يمكن التحصيل منها دون حضوره.",
  },
  processing_error: {
    messageEn: "A processing error occurred. Try again or use another collection method.",
    messageAr: "حدث خطأ في المعالجة. أعد المحاولة أو استخدم طريقة تحصيل أخرى.",
  },
  generic_decline: {
    messageEn: "The payment could not be completed.",
    messageAr: "تعذر إتمام التحصيل.",
  },
};

export function mapStripeFailureToLocalized(
  declineCode?: string | null,
  failureCode?: string | null,
): LocalizedFailureMessage {
  const raw = (declineCode ?? failureCode ?? "").toLowerCase();
  let reasonCode: RoadLiabilityStripeFailureCode = "generic_decline";
  if (raw.includes("insufficient_funds")) reasonCode = "insufficient_funds";
  else if (raw.includes("expired_card")) reasonCode = "expired_card";
  else if (raw.includes("do_not_honor")) reasonCode = "do_not_honor";
  else if (raw.includes("incorrect_cvc")) reasonCode = "incorrect_cvc";
  else if (raw.includes("authentication_required") || raw.includes("requires_action")) {
    reasonCode = "authentication_required";
  } else if (raw.includes("processing_error")) reasonCode = "processing_error";
  else if (raw.includes("card_declined") || raw.includes("generic_decline")) reasonCode = "card_declined";

  return { reasonCode, ...MESSAGES[reasonCode] };
}
