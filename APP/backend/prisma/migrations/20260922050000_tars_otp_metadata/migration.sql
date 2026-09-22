-- TARS OTP provider-driven metadata (no OTP plaintext).
ALTER TABLE "tars_contract_otp_challenges"
  ADD COLUMN IF NOT EXISTS "resendAvailableAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "otpLength" INTEGER,
  ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER;
