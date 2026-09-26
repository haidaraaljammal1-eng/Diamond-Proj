"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useReconciliation } from "../../hooks/use-reconciliation";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import type { ReconciliationPreviewImage } from "../../types/reconciliation.types";
import {
  ReconciliationImagePairsSection,
  ReconciliationImagePreviewDialog,
} from "./reconciliation-images";
import {
  ReconciliationCustodySection,
  ReconciliationReturnChargesSection,
  ReconciliationFinancialSummary,
  ReconciliationHeader,
  ReconciliationHistoricalBanner,
  ReconciliationRoadLiabilitiesSection,
  ReconciliationOutstandingRenewalsSection,
  ReconciliationSectionNav,
} from "./reconciliation-sections";
import { ReconciliationActionBar } from "./reconciliation-collection";
import styles from "./reconcile-dialog.module.css";

export interface ReconcileDialogProps {
  contractId: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

export function ReconcileDialog({ contractId, onClose, onCompleted }: ReconcileDialogProps) {
  const t = useTranslations("Contracts");
  return (
    <Dialog
      open={contractId != null}
      onClose={onClose}
      title={t("finalReconciliation.title")}
      description={t("finalReconciliation.description")}
      closeLabel={t("detail.close")}
      presentation="flush"
      size="wide"
    >
      {contractId ? (
        <ReconcileDialogBody key={contractId} contractId={contractId} onClose={onClose} onCompleted={onCompleted} />
      ) : null}
    </Dialog>
  );
}

function ReconciliationLoadingSkeleton() {
  return (
    <div className={styles.shell} aria-busy="true" data-testid="reconciliation-loading">
      <div className={styles.skeletonHeader} />
      <div className={styles.skeletonNav} />
      <div className={styles.skeletonBlockTall} />
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
    </div>
  );
}

function ReconcileDialogBody({
  contractId,
  onClose,
  onCompleted,
}: {
  contractId: string;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const t = useTranslations("Contracts");
  const reconciliation = useReconciliation();
  const [preview, setPreview] = useState<ReconciliationPreviewImage | null>(null);

  useEffect(() => {
    void reconciliation.load(contractId);
    return () => reconciliation.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed remount per contract
  }, [contractId]);

  const mutationError =
    reconciliation.lineMutation.error ??
    reconciliation.roadLiabilityMutation.error ??
    reconciliation.finalizeMutation.error ??
    reconciliation.cashMutation.error ??
    reconciliation.linkMutation.error;

  const errorMessage =
    resolveContractsErrorMessage(t, reconciliation.error) ??
    resolveContractsErrorMessage(t, mutationError);

  const handleCompletedClose = () => {
    onCompleted?.();
    if (reconciliation.data?.contract.status === "CLOSED" || reconciliation.data?.reconciliation.settled) {
      onClose();
    }
  };

  if (reconciliation.status === "loading" || reconciliation.status === "idle") {
    return <ReconciliationLoadingSkeleton />;
  }

  if (reconciliation.status === "error" || !reconciliation.data) {
    return (
      <div className={styles.shell} data-testid="reconciliation-load-error">
        <p className={styles.error} role="alert">
          {errorMessage ?? t("finalReconciliation.loadFailed")}
        </p>
        <div className={styles.dialogActions}>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => void reconciliation.load(contractId)}>
            {t("finalReconciliation.retry")}
          </Button>
        </div>
      </div>
    );
  }

  const data = reconciliation.data;
  const hasPhotos = data.imagePairs.length > 0;
  const hasLiabilities =
    data.roadLiabilities.attached.length > 0 || data.roadLiabilities.available.length > 0;

  return (
    <div className={styles.shell} data-testid="final-reconciliation-dialog">
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <ReconciliationHeader data={data} />
      <ReconciliationHistoricalBanner data={data} />
      <ReconciliationSectionNav hasPhotos={hasPhotos} hasLiabilities={hasLiabilities} />

      <div className={styles.scrollMain}>
        <ReconciliationImagePairsSection pairs={data.imagePairs} onPreview={setPreview} />
        <ReconciliationCustodySection custody={data.custody} />
        <ReconciliationRoadLiabilitiesSection
          data={data}
          confirmPending={reconciliation.roadLiabilityMutation.pending}
          onConfirm={(roadLiabilityId, amount) => {
            reconciliation.clearMutationErrors();
            void reconciliation.confirmRoadLiability(contractId, roadLiabilityId, {
              customerChargeAmount: amount,
            });
          }}
        />
        <ReconciliationOutstandingRenewalsSection data={data} />
        <ReconciliationReturnChargesSection
          data={data}
          linePending={reconciliation.lineMutation.pending}
          onAddDamage={(location, amount) => {
            reconciliation.clearMutationErrors();
            void reconciliation.addDamageLine(contractId, { type: "DAMAGE", description: location, amount });
          }}
          onUpdateDamage={(line, location, amount) => {
            reconciliation.clearMutationErrors();
            void reconciliation.updateDamageLine(contractId, line.id, {
              type: "DAMAGE",
              description: location,
              amount,
            });
          }}
          onDeleteDamage={(lineId) => {
            reconciliation.clearMutationErrors();
            void reconciliation.deleteDamageLine(contractId, lineId);
          }}
          onAddFuel={(amount) => {
            reconciliation.clearMutationErrors();
            void reconciliation.addFuelLine(contractId, {
              type: "FUEL",
              description: t("finalReconciliation.fuelChargeLabel"),
              amount,
            });
          }}
          onUpdateFuel={(line, amount) => {
            reconciliation.clearMutationErrors();
            void reconciliation.updateFuelLine(contractId, line.id, {
              type: "FUEL",
              description: line.description || t("finalReconciliation.fuelChargeLabel"),
              amount,
            });
          }}
          onDeleteFuel={(lineId) => {
            reconciliation.clearMutationErrors();
            void reconciliation.deleteFuelLine(contractId, lineId);
          }}
        />
        <ReconciliationFinancialSummary data={data} />
      </div>

      <ReconciliationActionBar
        data={data}
        issuedLink={reconciliation.issuedLink}
        finalizePending={reconciliation.finalizeMutation.pending}
        cashPending={reconciliation.cashMutation.pending}
        linkPending={reconciliation.linkMutation.pending}
        onFinalize={() => {
          reconciliation.clearMutationErrors();
          return reconciliation.finalize(contractId).then((ok) => {
            if (ok) handleCompletedClose();
            return ok;
          });
        }}
        onSettleCash={() => {
          reconciliation.clearMutationErrors();
          return reconciliation.settleCash(contractId).then((ok) => {
            if (ok) handleCompletedClose();
            return ok;
          });
        }}
        onGenerateLink={() => {
          reconciliation.clearMutationErrors();
          return reconciliation.generateLink(contractId);
        }}
      />

      <ReconciliationImagePreviewDialog
        pairs={data.imagePairs}
        active={preview}
        onClose={() => setPreview(null)}
        onNavigate={setPreview}
      />
    </div>
  );
}
