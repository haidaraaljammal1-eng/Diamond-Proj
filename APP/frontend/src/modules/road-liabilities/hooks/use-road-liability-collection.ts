"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePermissions } from "@/modules/auth";
import { normalizeApiError, type ApiRequestError } from "@/infrastructure/api/errors";
import {
  collectRoadLiabilityOffSession,
  confirmRoadLiabilityCashCollection,
  createRoadLiabilityPaymentLink,
  getRoadLiabilityCollection,
  startRoadLiabilityManualCollection,
} from "../api/road-liability-collection.api";
import { VIOLATIONS_CHARGE_PERMISSION } from "../road-liabilities.permissions";
import type {
  RoadLiabilityCollectionFailureDto,
  RoadLiabilityCollectionViewDto,
  RoadLiabilityListItemDto,
} from "../types/road-liabilities.types";
import { isSimulatedRoadLiabilityId } from "../utils/road-liability-status";

type CapabilityEntry =
  | { status: "loading" }
  | { status: "ready"; data: RoadLiabilityCollectionViewDto }
  | { status: "error" };

function isCollectionProbeCandidate(item: RoadLiabilityListItemDto): boolean {
  if (isSimulatedRoadLiabilityId(item.id)) return false;
  if (item.collectionStatus === "settled" || item.workState === "settled") return false;
  return item.workState === "collectible" && item.collectionStatus === "open";
}

export function useRoadLiabilityCollection(
  items: RoadLiabilityListItemDto[],
  onUpdated: () => void,
) {
  const { hasPermission } = usePermissions();
  const canCharge = hasPermission(VIOLATIONS_CHARGE_PERMISSION);

  const [capabilities, setCapabilities] = useState<Record<string, CapabilityEntry>>({});
  const probeRequestId = useRef(0);
  const probedIds = useRef(new Set<string>());
  const collectIdempotencyKey = useRef("");
  const cashCollectIdempotencyKey = useRef("");
  const paymentLinkIdempotencyKey = useRef("");

  const [collectItem, setCollectItem] = useState<RoadLiabilityListItemDto | null>(null);
  const [collectView, setCollectView] = useState<RoadLiabilityCollectionViewDto | null>(null);
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectSubmitting, setCollectSubmitting] = useState(false);
  const [collectError, setCollectError] = useState<ApiRequestError | null>(null);

  const [cashCollectItem, setCashCollectItem] = useState<RoadLiabilityListItemDto | null>(null);
  const [cashCollectView, setCashCollectView] = useState<RoadLiabilityCollectionViewDto | null>(
    null,
  );
  const [cashCollectLoading, setCashCollectLoading] = useState(false);
  const [cashCollectSubmitting, setCashCollectSubmitting] = useState(false);
  const [cashCollectError, setCashCollectError] = useState<ApiRequestError | null>(null);

  const [failure, setFailure] = useState<RoadLiabilityCollectionFailureDto | null>(null);
  const [failureLiabilityId, setFailureLiabilityId] = useState<string | null>(null);
  const [failureSubmitting, setFailureSubmitting] = useState(false);
  const [failureAction, setFailureAction] = useState<"manual" | "paymentLink" | null>(null);
  const [failureError, setFailureError] = useState<ApiRequestError | null>(null);

  const upsertCapability = useCallback((liabilityId: string, entry: CapabilityEntry) => {
    setCapabilities((current) => ({ ...current, [liabilityId]: entry }));
  }, []);

  const fetchCapability = useCallback(
    async (liabilityId: string): Promise<RoadLiabilityCollectionViewDto | null> => {
      upsertCapability(liabilityId, { status: "loading" });
      try {
        const data = await getRoadLiabilityCollection(liabilityId);
        upsertCapability(liabilityId, { status: "ready", data });
        return data;
      } catch {
        upsertCapability(liabilityId, { status: "error" });
        return null;
      }
    },
    [upsertCapability],
  );

  useEffect(() => {
    if (!canCharge) return;
    const id = ++probeRequestId.current;
    const candidates = items.filter(isCollectionProbeCandidate);
    for (const item of candidates) {
      if (probedIds.current.has(item.id)) continue;
      probedIds.current.add(item.id);
      upsertCapability(item.id, { status: "loading" });
      void getRoadLiabilityCollection(item.id)
        .then((data) => {
          if (id !== probeRequestId.current) return;
          upsertCapability(item.id, { status: "ready", data });
        })
        .catch(() => {
          if (id !== probeRequestId.current) return;
          upsertCapability(item.id, { status: "error" });
        });
    }
  }, [canCharge, items, upsertCapability]);

  const canCollectRow = useCallback(
    (item: RoadLiabilityListItemDto) => {
      if (!canCharge || !isCollectionProbeCandidate(item)) return false;
      const entry = capabilities[item.id];
      return entry?.status === "ready" && entry.data.capability.offSessionAvailable;
    },
    [canCharge, capabilities],
  );

  const canCashCollectRow = useCallback(
    (item: RoadLiabilityListItemDto) => {
      if (!canCharge || !isCollectionProbeCandidate(item)) return false;
      const entry = capabilities[item.id];
      return entry?.status === "ready" && entry.data.capability.cashCollectionRequired;
    },
    [canCharge, capabilities],
  );

  const closeCollectDialog = useCallback(() => {
    if (collectSubmitting) return;
    setCollectItem(null);
    setCollectView(null);
    setCollectError(null);
    setCollectLoading(false);
  }, [collectSubmitting]);

  const openCollectDialog = useCallback(
    async (item: RoadLiabilityListItemDto) => {
      if (!canCharge || collectSubmitting) return;
      setCollectItem(item);
      setCollectError(null);
      setCollectLoading(true);
      collectIdempotencyKey.current = crypto.randomUUID();
      const cached = capabilities[item.id];
      const view =
        cached?.status === "ready"
          ? cached.data
          : await fetchCapability(item.id);
      setCollectView(view);
      setCollectLoading(false);
      if (!view?.capability.offSessionAvailable) {
        closeCollectDialog();
      }
    },
    [canCharge, capabilities, collectSubmitting, closeCollectDialog, fetchCapability],
  );

  const closeFailureDialog = useCallback(() => {
    if (failureSubmitting) return;
    setFailure(null);
    setFailureLiabilityId(null);
    setFailureError(null);
    setFailureAction(null);
  }, [failureSubmitting]);

  const openFailureDialog = useCallback(
    (liabilityId: string, payload: RoadLiabilityCollectionFailureDto) => {
      setFailureLiabilityId(liabilityId);
      setFailure(payload);
      setFailureError(null);
      setFailureAction(null);
    },
    [],
  );

  const closeCashCollectDialog = useCallback(() => {
    if (cashCollectSubmitting) return;
    setCashCollectItem(null);
    setCashCollectView(null);
    setCashCollectError(null);
    setCashCollectLoading(false);
  }, [cashCollectSubmitting]);

  const openCashCollectDialog = useCallback(
    async (item: RoadLiabilityListItemDto) => {
      if (!canCharge || cashCollectSubmitting) return;
      setCashCollectItem(item);
      setCashCollectError(null);
      setCashCollectLoading(true);
      cashCollectIdempotencyKey.current = crypto.randomUUID();
      const cached = capabilities[item.id];
      const view =
        cached?.status === "ready" ? cached.data : await fetchCapability(item.id);
      setCashCollectView(view);
      setCashCollectLoading(false);
      if (!view?.capability.cashCollectionRequired) {
        closeCashCollectDialog();
      }
    },
    [
      canCharge,
      capabilities,
      cashCollectSubmitting,
      closeCashCollectDialog,
      fetchCapability,
    ],
  );

  const confirmCashCollect = useCallback(async () => {
    if (!cashCollectItem || !cashCollectView || cashCollectSubmitting) return;
    setCashCollectSubmitting(true);
    setCashCollectError(null);
    try {
      const view = await confirmRoadLiabilityCashCollection(
        cashCollectItem.id,
        cashCollectIdempotencyKey.current,
      );
      upsertCapability(cashCollectItem.id, { status: "ready", data: view });
      setCashCollectItem(null);
      setCashCollectView(null);
      onUpdated();
    } catch (error) {
      setCashCollectError(normalizeApiError(error));
    } finally {
      setCashCollectSubmitting(false);
    }
  }, [cashCollectItem, cashCollectSubmitting, cashCollectView, onUpdated, upsertCapability]);

  const confirmCollect = useCallback(async () => {
    if (!collectItem || !collectView || collectSubmitting) return;
    setCollectSubmitting(true);
    setCollectError(null);
    try {
      const result = await collectRoadLiabilityOffSession(
        collectItem.id,
        {},
        collectIdempotencyKey.current,
      );
      upsertCapability(collectItem.id, {
        status: "ready",
        data: {
          ...collectView,
          operationalState: result.operationalState,
          collectionStatus:
            result.status === "succeeded" ? "settled" : collectView.collectionStatus,
        },
      });
      setCollectItem(null);
      setCollectView(null);
      if (result.failure) {
        openFailureDialog(collectItem.id, result.failure);
      }
      onUpdated();
    } catch (error) {
      setCollectError(normalizeApiError(error));
    } finally {
      setCollectSubmitting(false);
    }
  }, [
    collectItem,
    collectSubmitting,
    collectView,
    onUpdated,
    openFailureDialog,
    upsertCapability,
  ]);

  const startManualCollection = useCallback(async () => {
    if (!failureLiabilityId || failureSubmitting) return;
    setFailureSubmitting(true);
    setFailureAction("manual");
    setFailureError(null);
    try {
      await startRoadLiabilityManualCollection(failureLiabilityId);
      closeFailureDialog();
      onUpdated();
    } catch (error) {
      setFailureError(normalizeApiError(error));
    } finally {
      setFailureSubmitting(false);
      setFailureAction(null);
    }
  }, [closeFailureDialog, failureLiabilityId, failureSubmitting, onUpdated]);

  const createPaymentLink = useCallback(async () => {
    if (!failureLiabilityId || failureSubmitting) return;
    setFailureSubmitting(true);
    setFailureAction("paymentLink");
    setFailureError(null);
    paymentLinkIdempotencyKey.current = crypto.randomUUID();
    try {
      const result = await createRoadLiabilityPaymentLink(
        failureLiabilityId,
        paymentLinkIdempotencyKey.current,
      );
      if (result.checkoutUrl && typeof window !== "undefined") {
        window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");
      }
      closeFailureDialog();
      onUpdated();
    } catch (error) {
      setFailureError(normalizeApiError(error));
    } finally {
      setFailureSubmitting(false);
      setFailureAction(null);
    }
  }, [closeFailureDialog, failureLiabilityId, failureSubmitting, onUpdated]);

  return {
    canCharge,
    canCollectRow,
    canCashCollectRow,
    openCollectDialog,
    openCashCollectDialog,
    collectDialog: {
      open: collectItem !== null,
      item: collectItem,
      view: collectView,
      loading: collectLoading,
      submitting: collectSubmitting,
      error: collectError,
      close: closeCollectDialog,
      confirm: confirmCollect,
    },
    cashCollectDialog: {
      open: cashCollectItem !== null,
      item: cashCollectItem,
      view: cashCollectView,
      loading: cashCollectLoading,
      submitting: cashCollectSubmitting,
      error: cashCollectError,
      close: closeCashCollectDialog,
      confirm: confirmCashCollect,
    },
    failureDialog: {
      open: failure !== null,
      failure,
      submitting: failureSubmitting,
      action: failureAction,
      error: failureError,
      close: closeFailureDialog,
      startManualCollection,
      createPaymentLink,
    },
  };
}
