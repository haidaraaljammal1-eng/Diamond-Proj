import { z } from "zod";
import { publicRentalFormSchema } from "./public-rental-form.schema";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "invalidDate" });

/** Stage-1 renter form + seven-field review (single RHF state). */
export const publicRentalReviewFormSchema = publicRentalFormSchema.extend({
  licenseDocumentId: z.string().uuid().optional(),
  passportDocumentId: z.string().uuid().optional(),
  drivingLicenseNumber: z.string().trim().min(1, { message: "required" }).max(50, {
    message: "tooLong",
  }),
  drivingLicenseExpiryDate: isoDate,
  passportNumber: z.string().trim().min(3, { message: "required" }).max(50, {
    message: "tooLong",
  }),
});

export type PublicRentalReviewFormValues = z.infer<typeof publicRentalReviewFormSchema>;
