"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePermissions } from "@/modules/auth";
import { useDemoSimulationStore } from "@/modules/demo-simulation/simulation.store";
import { normalizeApiError, type ApiRequestError } from "@/infrastructure/api/errors";
import { VIOLATIONS_CHARGE_PERMISSION } from "../road-liabilities.permissions";
import {
  confirmRoadLiabilityCustomerCharge,
  getRoadLiabilityCustomerCharge,
} from "../api/road-liability-charge.api";
import type { RoadLiabilityDetailDto } from "../types/road-liabilities.types";
import type {
  ConfirmRoadLiabilityChargePayload,
  RoadLiabilityCustomerChargeReviewDto,
} from "../types/road-liability-charge-review.types";
import {
  chargeReviewErrorKey,
  deriveChargeReviewState,
} from "../utils/road-liability-charge-review";
import { isGpsPredictionOnly, isSimulatedRoadLiabilityId } from "../utils/road-liability-status";
import { simulatedCustomerChargeReview } from "../utils/road-liability-simulation";

export function useRoadLiabilityChargeReview(
  detail: RoadLiabilityDetailDto | null,
  detailOpen: boolean,
  onConfirmed: () => void,
) {
  const { hasPermission } = usePermissions();
  const canCharge = hasPermission(VIOLATIONS_CHARGE_PERMISSION);
  const overlay = useDemoSimulationStore((state) => state.roadLiabilitiesOverlay);
  const attachSimulated = useDemoSimulationStore(
    (state) => state.attachSimulatedRoadLiabilityCharge,
  );

  const [fetched, setFetched] = useState<{
    liabilityId: string;
    data: RoadLiabilityCustomerChargeReviewDto | null;
  } | null>(null);
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiRequestError | null>(null);
  const [dialogForId, setDialogForId] = useState<string | null>(null);
  const requestId = useRef(0);
  const idempotencyKey = useRef<string>("");

  const simulated = Boolean(detail && isSimulatedRoadLiabilityId(detail.id));
  const skipRemote =
    !detail ||
    isGpsPredictionOnly(detail) ||
    detail.attributionStatus === "unmatched" ||
    detail.attributionStatus === "ambiguous";

  const review = useMemo(() => {
    if (!detail) return null;
    if (simulated) {
      return overlay ? simulatedCustomerChargeReview(overlay, detail) : null;
    }
    if (skipRemote) return null;
    return fetched?.liabilityId === detail.id ? fetched.data : null;
  }, [detail, fetched, overlay, simulated, skipRemote]);

  const loading = Boolean(detail && fetchingId === detail.id);

  useEffect(() => {
    if (!detailOpen || !detail || skipRemote || simulated) return;
    const liabilityId = detail.id;
    const id = ++requestId.current;
    void getRoadLiabilityCustomerCharge(liabilityId)
      .then((data) => {
        if (id !== requestId.current) return;
        setFetched({ liabilityId, data });
        setFetchingId((current) => (current === liabilityId ? null : current));
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setFetched({ liabilityId, data: null });
        setFetchingId((current) => (current === liabilityId ? null : current));
      });
    void Promise.resolve().then(() => {
      if (id !== requestId.current) return;
      setFetchingId(liabilityId);
    });
  }, [detail, detailOpen, simulated, skipRemote]);

  const ui = useMemo(
    () =>
      deriveChargeReviewState({
        detail,
        review,
        canCharge,
        loading,
      }),
    [canCharge, detail, loading, review],
  );

  const dialogOpen = Boolean(detail && detailOpen && dialogForId === detail.id);

  const openDialog = useCallback(() => {
    if (!detail || ui.kind !== "available") return;
    idempotencyKey.current = crypto.randomUUID();
    setSubmitError(null);
    setDialogForId(detail.id);
  }, [detail, ui.kind]);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    setDialogForId(null);
    setSubmitError(null);
  }, [submitting]);

  const confirm = useCallback(
    async (payload: ConfirmRoadLiabilityChargePayload) => {
      if (!detail || submitting) return false;
      setSubmitting(true);
      setSubmitError(null);
      try {
        if (simulated) {
          attachSimulated(detail.id, payload);
          setDialogForId(null);
          onConfirmed();
          return true;
        }
        const next = await confirmRoadLiabilityCustomerCharge(
          detail.id,
          payload,
          idempotencyKey.current,
        );
        setFetched({ liabilityId: detail.id, data: next });
        setDialogForId(null);
        onConfirmed();
        return true;
      } catch (error) {
        const normalized = normalizeApiError(error);
        if (chargeReviewErrorKey(normalized) === "charge.alreadyCharged" && !simulated) {
          try {
            const next = await getRoadLiabilityCustomerCharge(detail.id);
            setFetched({ liabilityId: detail.id, data: next });
            setDialogForId(null);
            onConfirmed();
            return true;
          } catch {
            setSubmitError(normalized);
            return false;
          }
        }
        setSubmitError(normalized);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [attachSimulated, detail, onConfirmed, simulated, submitting],
  );

  return {
    canCharge,
    ui,
    loading,
    submitting,
    submitError,
    dialogOpen,
    openDialog,
    closeDialog,
    confirm,
  };
}
