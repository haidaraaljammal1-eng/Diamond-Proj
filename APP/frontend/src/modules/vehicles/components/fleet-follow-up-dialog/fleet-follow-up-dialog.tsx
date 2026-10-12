"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import type { VehicleCardDto } from "../../types/vehicle.types";
import styles from "./fleet-follow-up-dialog.module.css";

export interface FleetFollowUpDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
  onSelectContract: (contractId: string) => void;
}

export function FleetFollowUpDialog({
  vehicle,
  onClose,
  onSelectContract,
}: FleetFollowUpDialogProps) {
  const t = useTranslations("Vehicles");
  const open = vehicle != null;
  const offers = vehicle?.prePaymentFollowUps ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("followUpPicker.title")}
      closeLabel={t("detail.close")}
    >
      <p className={styles.intro}>{t("followUpPicker.description", { name: vehicle?.displayName ?? "" })}</p>
      <ul className={styles.list}>
        {offers.map((offer) => (
          <li key={offer.contractId}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={styles.row}
              onClick={() => {
                onSelectContract(offer.contractId);
                onClose();
              }}
            >
              <span dir="ltr">{offer.contractNumber}</span>
              <span className={styles.status}>{t(`followUpPicker.status.${offer.status}`)}</span>
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
