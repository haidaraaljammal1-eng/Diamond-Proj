"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { usePermissions } from "@/modules/auth/hooks/use-permissions";
import {
  deletePendingRentalRequest,
  startContractReturnStaff,
} from "@/modules/contracts/api/contracts.api";
import { resolveContractsErrorMessage } from "@/modules/contracts/utils/resolve-contracts-error";
import { isApiRequestError } from "@/infrastructure/api/errors";
import {
  CONTRACTS_MANAGE_PERMISSION,
  CONTRACTS_RENEW_PERMISSION,
  CONTRACTS_RETURN_PERMISSION,
} from "@/modules/contracts/contracts.permissions";
import { MAINTENANCE_MANAGE_PERMISSION } from "@/modules/maintenance/maintenance.permissions";
import { getWhatsAppConnection } from "@/modules/whatsapp/api/whatsapp.api";
import { WHATSAPP_SEND_PERMISSION } from "@/modules/whatsapp/whatsapp.permissions";
import {
  isFunctionalRbacV2UiEnabled,
  useDiamondPageAccess,
} from "@/modules/functional-rbac";
import { useVehicle } from "../../hooks/use-vehicle";
import { VehicleWhatsAppShareDialog } from "../vehicle-whatsapp-share-dialog/vehicle-whatsapp-share-dialog";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleDetail } from "./vehicle-detail";
import styles from "./vehicle-detail-dialog.module.css";

export interface VehicleDetailDialogProps {
  vehicle: VehicleCardDto | null;
  canManage: boolean;
  onClose: () => void;
  onSetPrice: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onCarIn: (contractId: string) => void;
  onFleetChanged: () => void;
  onNavigateToMaintenance: (vehicleId: number, options?: { create?: boolean; orderId?: number }) => void;
  onPhotoNotice?: (message: string) => void;
  onRenewRental: (contractId: string) => void;
  fleetReloadToken?: number;
}

type ConfirmKind = "return-now" | "cancel-rental-request" | null;

export function VehicleDetailDialog({
  vehicle,
  canManage,
  onClose,
  onSetPrice,
  onPrimaryAction,
  onCarIn,
  onFleetChanged,
  onNavigateToMaintenance,
  onPhotoNotice,
  onRenewRental,
  fleetReloadToken = 0,
}: VehicleDetailDialogProps) {
  const t = useTranslations("Vehicles");
  const tc = useTranslations("Contracts");
  const format = useFormatter();
  const { hasPermission } = usePermissions();
  const canReturn = hasPermission(CONTRACTS_RETURN_PERMISSION);
  const canCancelRental = hasPermission(CONTRACTS_MANAGE_PERMISSION);
  const canManageMaintenance = hasPermission(MAINTENANCE_MANAGE_PERMISSION);
  const canRenewContract = hasPermission(CONTRACTS_RENEW_PERMISSION);
  const whatsappPageAllowed = useDiamondPageAccess("whatsapp");
  const v2 = isFunctionalRbacV2UiEnabled();
  const canSendWhatsApp = v2 ? whatsappPageAllowed : hasPermission(WHATSAPP_SEND_PERMISSION);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [whatsappShareReady, setWhatsappShareReady] = useState(false);

  const {
    detail,
    isLoading,
    isReady,
    error,
    isPhotoActionPending,
    photoActionError,
    isVideoActionPending,
    videoActionError,
    loadVehicle,
    clearVehicle,
    uploadVehiclePhoto,
    replaceVehiclePhoto,
    deleteVehiclePhoto,
    clearPhotoActionError,
    uploadVehicleVideo,
    deleteVehicleVideo,
    clearVideoActionError,
  } = useVehicle();

  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [fleetOpsPending, setFleetOpsPending] = useState(false);
  const [fleetOpsError, setFleetOpsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canSendWhatsApp || !isReady || !detail) {
      setWhatsappShareReady(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const connection = await getWhatsAppConnection();
        if (cancelled) return;
        const ready =
          connection.status === "LINKED" &&
          (connection.providerSessionStatus === "AUTHENTICATED" ||
            connection.providerSessionStatus == null);
        setWhatsappShareReady(ready && connection.capabilities.supportsImage);
      } catch {
        if (!cancelled) setWhatsappShareReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canSendWhatsApp, isReady, detail?.id]);

  useEffect(() => {
    if (!vehicle) {
      clearVehicle();
      return;
    }
    clearPhotoActionError();
    clearVideoActionError();
    setFleetOpsError(null);
    void loadVehicle(vehicle.id);
  }, [vehicle, loadVehicle, clearVehicle, clearPhotoActionError, clearVideoActionError, fleetReloadToken]);

  /**
   * Fleet `currentRental.status === "active"` is the backend projection of an ACTIVE
   * blocking contract (see `current-rental.ts`). Same rule as `actions.canRenew`.
   */
  const renewRentalFooter = useMemo(() => {
    if (!canRenewContract) return { status: "idle" as const };
    const cardRental = vehicle?.currentRental ?? null;
    const detailRental = detail?.currentRental ?? null;
    const resolvedRental =
      detailRental?.status === "active"
        ? detailRental
        : isReady &&
            detail &&
            detail.operationalStatus === "rented" &&
            cardRental?.status === "active"
          ? cardRental
          : !isReady && cardRental?.status === "active"
            ? cardRental
            : detailRental ?? cardRental;

    if (!isReady && resolvedRental?.status === "active") {
      return { status: "loading" as const, contractId: resolvedRental.contractId };
    }
    if (resolvedRental?.status === "active") {
      return { status: "ready" as const, contractId: resolvedRental.contractId };
    }
    if (resolvedRental?.status === "retout") {
      return {
        status: "blocked" as const,
        contractId: resolvedRental.contractId,
        backendCanRenew: false,
      };
    }
    return { status: "idle" as const };
  }, [
    canRenewContract,
    vehicle?.currentRental,
    detail?.currentRental,
    detail?.operationalStatus,
    isReady,
    detail,
    fleetReloadToken,
  ]);

  const photoActionErrorMessage = resolveVehiclesErrorMessage(t, photoActionError);
  const videoActionErrorMessage = resolveVehiclesErrorMessage(t, videoActionError);
  const pendingFollowUp = detail?.prePaymentFollowUps?.[0] ?? null;

  const handleUploadPhoto = useCallback(
    async (file: File) => {
      if (!detail) return;
      const result = await uploadVehiclePhoto(detail.id, file);
      if (result.ok) {
        onPhotoNotice?.(t("detail.photoUploadSuccess"));
      }
    },
    [detail, uploadVehiclePhoto, onPhotoNotice, t],
  );

  const handleReplacePhoto = useCallback(
    async (photoId: string, file: File) => {
      if (!detail) return;
      const result = await replaceVehiclePhoto(detail.id, photoId, file);
      if (!result.ok) return;
      if (result.deleteFailed) {
        onPhotoNotice?.(t("detail.photoReplaceDeleteFailed"));
        return;
      }
      onPhotoNotice?.(t("detail.photoReplaceSuccess"));
    },
    [detail, replaceVehiclePhoto, onPhotoNotice, t],
  );

  const handleDeletePhoto = useCallback(
    async (photoId: string) => {
      if (!detail) return;
      const ok = await deleteVehiclePhoto(detail.id, photoId);
      if (ok) onPhotoNotice?.(t("detail.photoDeleteSuccess"));
    },
    [detail, deleteVehiclePhoto, onPhotoNotice, t],
  );

  const handleUploadVideo = useCallback(
    async (file: File) => {
      if (!detail) return;
      const ok = await uploadVehicleVideo(detail.id, file);
      if (ok) onPhotoNotice?.(t("detail.videoUploadSuccess"));
    },
    [detail, uploadVehicleVideo, onPhotoNotice, t],
  );

  const handleDeleteVideo = useCallback(async () => {
    if (!detail) return;
    const ok = await deleteVehicleVideo(detail.id);
    if (ok) onPhotoNotice?.(t("detail.videoDeleteSuccess"));
  }, [detail, deleteVehicleVideo, onPhotoNotice, t]);

  const runReturnNow = useCallback(async () => {
    if (!detail?.currentRental?.contractId) return;
    setFleetOpsPending(true);
    setFleetOpsError(null);
    try {
      await startContractReturnStaff(detail.currentRental.contractId);
      await loadVehicle(detail.id);
      onFleetChanged();
      onCarIn(detail.currentRental.contractId);
      onClose();
    } catch {
      setFleetOpsError(t("detail.returnNowFailed"));
    } finally {
      setFleetOpsPending(false);
      setConfirmKind(null);
    }
  }, [detail, loadVehicle, onCarIn, onClose, onFleetChanged, t]);

  const runDeleteRentalRequest = useCallback(async () => {
    if (!detail || !pendingFollowUp) return;
    setFleetOpsPending(true);
    setFleetOpsError(null);
    try {
      await deletePendingRentalRequest(pendingFollowUp.contractId, { vehicleId: detail.id });
      await loadVehicle(detail.id);
      onFleetChanged();
      setConfirmKind(null);
      onClose();
    } catch (err) {
      const backendMessage = isApiRequestError(err)
        ? resolveContractsErrorMessage(tc, err)
        : null;
      setFleetOpsError(backendMessage ?? t("detail.deleteRentalRequestFailed"));
    } finally {
      setFleetOpsPending(false);
    }
  }, [detail, loadVehicle, onClose, onFleetChanged, pendingFollowUp, t, tc]);

  const open = vehicle != null;
  const rental = detail?.currentRental;
  const isDeleteDialog = confirmKind === "cancel-rental-request";
  const canShareWhatsApp =
    canSendWhatsApp &&
    whatsappShareReady &&
    (detail?.gallery.length ?? 0) > 0;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={vehicle?.displayName ?? t("title")}
        closeLabel={t("detail.close")}
        presentation="flush"
        size="xl"
      >
        <div
          className={[
            styles.shell,
            isReady && detail ? styles.shellReady : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
        {isLoading ? (
          <div className={styles.loading} role="status">{t("detail.loading")}</div>
        ) : null}
        {error ? (
          <div className={styles.error} role="alert">
            <p>{t("detail.error")}</p>
            <Button type="button" size="sm" onClick={onClose}>{t("detail.close")}</Button>
          </div>
        ) : null}
        {isReady && detail ? (
          <VehicleDetail
            vehicle={detail}
            canManage={canManage}
            canReturn={canReturn}
            canManageMaintenance={canManageMaintenance}
            canCancelRental={canCancelRental && pendingFollowUp != null}
            isPhotoActionPending={isPhotoActionPending}
            isVideoActionPending={isVideoActionPending}
            isFleetOpsPending={fleetOpsPending}
            photoActionErrorMessage={photoActionErrorMessage}
            videoActionErrorMessage={videoActionErrorMessage}
            fleetOpsErrorMessage={fleetOpsError}
            onUploadPhoto={(file) => void handleUploadPhoto(file)}
            onReplacePhoto={(photoId, file) => void handleReplacePhoto(photoId, file)}
            onDeletePhoto={(photoId) => void handleDeletePhoto(photoId)}
            onUploadVideo={(file) => void handleUploadVideo(file)}
            onDeleteVideo={() => void handleDeleteVideo()}
            canShareWhatsApp={canShareWhatsApp}
            onShareWhatsApp={() => setShareDialogOpen(true)}
            onSetPrice={() => {
              onClose();
              onSetPrice(detail);
            }}
            onPrimaryAction={() => {
              onClose();
              onPrimaryAction(detail);
            }}
            onSendToMaintenance={() => {
              onClose();
              onNavigateToMaintenance(detail.id, { create: true });
            }}
            onViewMaintenance={() => {
              onClose();
              onNavigateToMaintenance(detail.id, {
                orderId: detail.activeMaintenanceOrder?.id,
              });
            }}
            onReturnNow={() => setConfirmKind("return-now")}
            onCancelRentalRequest={() => setConfirmKind("cancel-rental-request")}
            onContinueCarIn={() => {
              if (rental?.contractId) {
                onClose();
                onCarIn(rental.contractId);
              }
            }}
            renewRentalFooter={renewRentalFooter}
            onRenewRental={() => {
              if (renewRentalFooter.status === "ready") {
                onRenewRental(renewRentalFooter.contractId);
              }
            }}
          />
        ) : null}
        </div>
      </Dialog>

      <Dialog
        open={confirmKind != null}
        onClose={() => {
          if (fleetOpsPending) return;
          setConfirmKind(null);
        }}
        title={
          isDeleteDialog
            ? t("detail.deleteRentalRequestWarningTitle")
            : t("detail.returnNow")
        }
        closeLabel={isDeleteDialog ? t("detail.deleteRentalRequestGoBack") : t("detail.cancelConfirm")}
      >
        {detail ? (
          <div className={styles.confirmBody}>
            {isDeleteDialog && pendingFollowUp ? (
              <>
                <div className={styles.confirmWarningHeader}>
                  <span className={styles.confirmWarningIcon} aria-hidden="true">!</span>
                  <p className={styles.confirmLead}>{t("detail.deleteRentalRequestWarningBody1")}</p>
                </div>
                <p className={styles.confirmNotice}>{t("detail.deleteRentalRequestWarningBody2")}</p>
                <dl className={styles.confirmMeta}>
                  <div>
                    <dt>{t("detail.deleteRentalRequestVehicleLabel")}</dt>
                    <dd>{detail.displayName}</dd>
                  </div>
                  <div>
                    <dt>{t("detail.plate")}</dt>
                    <dd dir="ltr">{detail.plateNumber ?? t("rateNotSet")}</dd>
                  </div>
                  <div>
                    <dt>{t("detail.deleteRentalRequestContractLabel")}</dt>
                    <dd dir="ltr">{pendingFollowUp.contractNumber}</dd>
                  </div>
                  {pendingFollowUp.customerName ? (
                    <div>
                      <dt>{t("detail.deleteRentalRequestCustomerLabel")}</dt>
                      <dd>{pendingFollowUp.customerName}</dd>
                    </div>
                  ) : null}
                </dl>
                {fleetOpsError ? (
                  <p className={styles.confirmError} role="alert">{fleetOpsError}</p>
                ) : null}
                <div className={styles.confirmActionsStack}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={fleetOpsPending}
                    onClick={() => setConfirmKind(null)}
                  >
                    {t("detail.deleteRentalRequestGoBack")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={styles.destructiveConfirm}
                    loading={fleetOpsPending}
                    onClick={() => void runDeleteRentalRequest()}
                  >
                    {t("detail.deleteRentalRequestConfirm")}
                  </Button>
                </div>
              </>
            ) : null}
            {!isDeleteDialog ? (
              <>
                <p className={styles.confirmLead}>{detail.displayName}</p>
                <p className={styles.confirmPlate} dir="ltr">
                  {detail.plateNumber ?? t("rateNotSet")}
                </p>
                {confirmKind === "return-now" && rental ? (
                  <>
                    <p dir="ltr">{rental.contractNumber ?? rental.contractId}</p>
                    <p>
                      {t("detail.returnNowScheduled", {
                        when: format.dateTime(new Date(rental.endAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </p>
                    <p className={styles.confirmNotice}>{t("detail.returnNowNotice")}</p>
                  </>
                ) : null}
                <div className={styles.confirmActions}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmKind(null)}>
                    {t("detail.cancelConfirm")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={fleetOpsPending}
                    onClick={() => {
                      if (confirmKind === "return-now") void runReturnNow();
                    }}
                  >
                    {t("detail.confirmAction")}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </Dialog>

      {detail ? (
        <VehicleWhatsAppShareDialog
          open={shareDialogOpen}
          vehicleId={detail.id}
          vehicleLabel={detail.displayName}
          gallery={detail.gallery}
          onClose={() => setShareDialogOpen(false)}
        />
      ) : null}
    </>
  );
}
