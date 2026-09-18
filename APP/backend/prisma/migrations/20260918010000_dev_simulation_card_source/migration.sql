-- DEV simulation cards deliberately have no Stripe PaymentMethod id.
ALTER TABLE "contract_card_payment_methods"
ALTER COLUMN "stripePaymentMethodId" DROP NOT NULL;
