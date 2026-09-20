/**
 * DIAMOND_CONTRACT_V1 — official rental agreement wording.
 *
 * Copied verbatim from the approved Diamond HTML demo (`CONTRACT_HTML`). This is
 * legal text: do not rewrite, translate, or "improve" it here. The contract stays
 * bilingual regardless of the app locale.
 *
 * Intentionally NOT carried over from the demo:
 * - Deposit field (Diamond V1 has no deposit)
 * - Monthly / Weekly / Daily rental-rate boxes (vehicle rental price is not shown)
 * - Manual credit-card number / expiry / name / signature grid (Stripe only)
 */

export const OFFICIAL_CONTRACT_TEMPLATE_VERSION = "DIAMOND_CONTRACT_V1";

export const CONTRACT_HEADER = {
  logoSrc: "/official-contract/diamond-contract-logo.png",
  logoAlt: "Diamond Elite Rent Car",
  mobile: "Mob: +971 50 549 6332",
  emailLabel: "Email:",
  email: "alladiamondcar@gmail.com",
  location: "Dubai - UAE",
} as const;

export const CONTRACT_AGREEMENT_LABEL = "Agreement No:";

export const CONTRACT_TITLE = {
  en: ["Contract Agreement Between", "Diamond unique Car Rentals CO. LLC S.O.C With Hirer & Sponsor"],
  ar: ["عقد اتفاقية تأجير بين", "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و والمستأجر والكفيل"],
} as const;

/** Mileage terms sentence. `{km}` and `{rate}` are the only data slots. */
export const CONTRACT_MILEAGE_TERMS = {
  before: "The hirer allowed driving Per Day (",
  middle: ")km above that",
  secondBefore: "we will charge(",
  after: ")AED per every km.",
} as const;

export const CONTRACT_CUSTODY = {
  out: { tag: "VEHICLE OUT", mileageEn: "Mileage OUT", fuel: "Fuel OUT" },
  in: { tag: "VEHICLE IN", mileageEn: "Mileage IN", fuel: "Fuel IN" },
  mileageAr: "عداد الكيلومتر",
  signatureEn: "Hirer Signature",
  signatureAr: "توقيع المستأجر",
  views: {
    top: "TOP VIEW — مسقط علوي",
    left: "LEFT — أيسر",
    right: "RIGHT — أيمن",
    frontRear: "FRONT/REAR",
  },
} as const;

/** Legal authorization wording only. The card-data entry grid is not reproduced. */
export const CONTRACT_CARD_AUTHORIZATION = {
  headingEn: "Credit Card Deducting",
  headingAr: "اتفاقية سحب من بطاقة الائتمان",
  en: "I'm authorizing Diamond unique Car Rentals L.L.C to charge any monetary dues on my credit card such as rental payments, traffic violation tickets and/or any additional charges that had resulted damages to the rented vehicle.",
  ar: [
    "أنا أفوض مكتب شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و بالسحب من بطاقة الائتمان الخاصة بي",
    "جميع مبالغ الإيجار بالإضافة إلى المبالغ المترتبة على أي حادث أو مخالفة مرورية، بلدية … إلخ",
    "أو مبالغ التعويض عن أي أضرار تحدث للسيارة",
  ],
} as const;

/**
 * Terms lines (EN left, AR right). `blank: true` marks the demo's empty
 * handwritten amount slot, which has no Diamond data source and stays blank.
 */
export const CONTRACT_TERMS: ReadonlyArray<{
  en: string;
  ar: string;
  continuation?: boolean;
  blank?: boolean;
}> = [
  { en: "• If you do not have a prior agreement to rent weekly or", ar: "إذا لم يكن اتفاق مسبق للإيجار الاسبوعي أو الشهري" },
  { en: "monthly, rate will be calculated at daily rate.", ar: "فسوف يحسب بواقع السعر اليومي", continuation: true },
  { en: "• In the event of an accident and the tenant is the cause of", ar: "في حال حدوث حادث وكان المستأجر السبب بالحادث" },
  { en: "the incident will be obliged to pay an amount of", ar: "", continuation: true },
  { en: ") AED rent", ar: "يكون ملزم بدفع مبلغ وقدره (    ) درهم", continuation: true, blank: true },
  {
    en: "• In addition to violation charges, hirer pays an extra\n50 AED for each violation received: 10 AED Knowledge",
    ar: "بالإضافة إلى رسوم المخالفات، يدفع المستأجر مبلغاً إضافياً قدره 50 درهماً إماراتياً عن كل مخالفة يتم استلامها: 10 دراهم إماراتية رسوم معرفة",
  },
  { en: "• 10 AED Innovation + 30 AED Administration charges.", ar: "10 دراهم إماراتية رسوم ابتكار + 30 درهماً إماراتياً رسوم إدارية" },
];

export const CONTRACT_ACKNOWLEDGEMENT = {
  ar: "أنا / نحن نقر بأننا اطلعنا على هذه الاتفاقية والشروط والبنود المدونة من أمام و خلف هذه الاتفاقية و نوافق عليها ولأجله وقّعنا.",
  en: "I/WE ACKNOWLEDGE THAT THE TERMS & CONDITIONS ON BOTH SIDES OF THIS AGREEMENT ARE READ & UNDERSTOOD, AND TO THAT WE SIGNED WITHOUT OBJECTION.",
} as const;

export const CONTRACT_SIGNATURES = [
  { id: "hirer", en: "Hirer Signature", ar: "توقيع المستأجر" },
  { id: "additionalDriver", en: "Additional Driver Signature", ar: "توقيع السائق الإضافي" },
  { id: "sponsor", en: "Sponsor Signature", ar: "توقيع الكفيل" },
] as const;

/**
 * Bilingual labels for info-grid field paths (demo wording). `reviewField`
 * links a DTO path to its review PATCH key; whether it is editable is decided
 * only by the Backend's `permissions.editableFields`.
 */
export const CONTRACT_FIELD_CATALOG: Record<
  string,
  { en: string; ar: string; reviewField?: string; dir: "ltr" | "rtl" | "auto" }
> = {
  "vehicle.plateCode": { en: "Plate Code", ar: "رمز اللوحة", dir: "ltr" },
  "vehicle.vehicleType": { en: "Vehicle Type", ar: "المركبة", dir: "auto" },
  "hirer.name": { en: "Hirer Name", ar: "اسم المستأجر", reviewField: "hirerName", dir: "auto" },
  "vehicle.yearMade": { en: "Year Made", ar: "سنة الصنع", dir: "ltr" },
  "vehicle.plateNumber": { en: "Plate. No.", ar: "رقم المركبة", dir: "ltr" },
  "hirer.nationality": { en: "Nationality", ar: "الجنسية", reviewField: "nationality", dir: "auto" },
  "vehicle.notes": { en: "Notes", ar: "ملاحظات", dir: "auto" },
  "vehicle.color": { en: "Vehicle Color", ar: "لون المركبة", dir: "auto" },
  "hirer.passportNumber": { en: "Passport No. / I.D.", ar: "جواز سفر / بطاقة", reviewField: "passportNumber", dir: "ltr" },
  "vehicleOut.occurredAt|rental.plannedStartAt@time": { en: "Time Out", ar: "ساعة الخروج", dir: "ltr" },
  "vehicleOut.occurredAt|rental.plannedStartAt@date": { en: "Date Out", ar: "تاريخ الخروج", dir: "ltr" },
  "hirer.address": { en: "Address", ar: "العنوان", reviewField: "address", dir: "auto" },
  "hirer.telephone": { en: "Tel", ar: "الهاتف", reviewField: "telephone", dir: "ltr" },
  "vehicleIn.occurredAt|rental.plannedEndAt@time": { en: "Time In", ar: "ساعة الدخول", dir: "ltr" },
  "vehicleIn.occurredAt|rental.plannedEndAt@date": { en: "Date In", ar: "تاريخ الدخول", dir: "ltr" },
  "hirer.driverLicenseExpiryDate": { en: "Expiry Date", ar: "تاريخ الانتهاء", dir: "ltr" },
  "hirer.driverLicenseNumber": { en: "Driving LIC. NO.", ar: "رقم رخصة القيادة", dir: "ltr" },
  "additionalDriver.driverLicenseNumber": {
    en: "Driving LIC. NO.",
    ar: "رقم رخصة القيادة",
    reviewField: "additionalDriverLicenseNumber",
    dir: "ltr",
  },
  "additionalDriver.name": { en: "Additional Driver", ar: "سائق إضافي", reviewField: "additionalDriverName", dir: "auto" },
  "additionalDriver.nationality": {
    en: "Nationality",
    ar: "الجنسية",
    reviewField: "additionalDriverNationality",
    dir: "auto",
  },
  "sponsor.name": { en: "Sponsor Name", ar: "اسم الكفيل", reviewField: "sponsorName", dir: "auto" },
  "rental.numberOfDays": { en: "No. of Days", ar: "عدد الأيام", dir: "ltr" },
  "sponsor.idNumber": { en: "Passport NO. / I.D.", ar: "جواز سفر / بطاقة", reviewField: "sponsorIdNumber", dir: "ltr" },
};
