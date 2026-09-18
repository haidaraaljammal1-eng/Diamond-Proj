"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { VehicleConditionSheet } from "../../components/vehicle-condition-sheet/vehicle-condition-sheet";
import { ContractInspectionImage } from "../../components/contract-inspection-image/contract-inspection-image";
import { ContractTarsInlineStatus } from "../../components/contract-tars/contract-tars-inline-status";
import { useContract } from "../../hooks/use-contract";
import type { CarOutAngle, FuelLevel } from "../../types/contract.types";
import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import styles from "./car-out-dialog.module.css";

const REQUIRED: readonly CarOutAngle[] = ["FRONT", "REAR", "LEFT", "RIGHT", "FRONT_LEFT", "FRONT_RIGHT", "REAR_LEFT", "REAR_RIGHT"];
const OPTIONAL: readonly CarOutAngle[] = ["ODOMETER", "DASHBOARD_FUEL", "OTHER"];
const ALL = [...REQUIRED, ...OPTIONAL] as const;

export interface CarOutDialogProps { contractId: string | null; onClose: () => void; }

export function CarOutDialog({ contractId, onClose }: CarOutDialogProps) {
  const t = useTranslations("Contracts");
  return <Dialog open={contractId != null} onClose={onClose} title={t("carOut.title")} description={t("carOut.description")} closeLabel={t("detail.close")} presentation="flush">
    {contractId ? <CarOutHandover contractId={contractId} onClose={onClose} /> : null}
  </Dialog>;
}

function CarOutHandover({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const { detail, detailStatus, carOutHandover, carOutPending, carOutError, loadContract, loadCarOut, saveCarOutDraft, uploadCarOutPhoto, uploadCarOutSignature, deleteCarOutPhoto, completeCarOut } = useContract();
  const [mileage, setMileage] = useState("");
  const [fuel, setFuel] = useState<FuelLevel>("F");
  const [damage, setDamage] = useState<DamageMark[]>([]);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const signaturePreviewRef = useRef<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);

  useEffect(() => { initialized.current = false; void Promise.all([loadContract(contractId), loadCarOut(contractId)]); }, [contractId, loadContract, loadCarOut]);
  useEffect(() => {
    if (!carOutHandover || initialized.current) return;
    initialized.current = true;
    setMileage(carOutHandover.mileageOut == null ? "" : String(carOutHandover.mileageOut));
    setFuel((carOutHandover.fuelOut as FuelLevel | null) ?? "F");
    setDamage(carOutHandover.damageOut ?? []);
    setNotes(carOutHandover.notes ?? "");
  }, [carOutHandover]);
  useEffect(() => () => {
    if (signaturePreviewRef.current) URL.revokeObjectURL(signaturePreviewRef.current);
  }, []);
  const clearSignaturePreview = () => {
    if (signaturePreviewRef.current) URL.revokeObjectURL(signaturePreviewRef.current);
    signaturePreviewRef.current = null;
    setSignaturePreviewUrl(null);
  };

  const handover = carOutHandover ?? detail?.carOutHandover ?? null;
  const errorMessage = resolveContractsErrorMessage(t, carOutError);
  if (detailStatus === "loading" || !detail) {
    return errorMessage && detailStatus === "error"
      ? <p className={styles.error} role="alert">{errorMessage}</p>
      : <div className={styles.loading}>{t("carOut.loading")}</div>;
  }
  if (!handover) return <p className={styles.error} role="alert">{errorMessage ?? t("carOut.loading")}</p>;
  const completed = handover.status === "COMPLETED" || detail.status === "ACTIVE";
  const editable = handover.actions.canEdit && detail.status === "PAID";
  const photos = handover.photoEvidence.photos;
  const angleLabel = (angle: CarOutAngle) => t.has(`carOut.angle.${angle}`) ? t(`carOut.angle.${angle}`) : t(`carOutAngles.${angle}`);
  const completionMissing = [
    ...handover.photoEvidence.missing.map((angle) => angleLabel(angle)),
    ...(handover.signature.present ? [] : [t("carOut.signatureMissing")]),
  ];

  async function saveDraft() {
    setSaved(false);
    if (signature) {
      const ok = await uploadCarOutSignature(contractId, new File([signature], "hirer-out-signature.png", { type: "image/png" }));
      if (!ok) return;
      setSignature(null);
    }
    const ok = await saveCarOutDraft(contractId, {
      ...(mileage.trim() ? { mileageOut: Number(mileage) } : {}),
      fuelOut: fuel, damageOut: damage, notes: notes || null,
    });
    if (ok) setSaved(true);
  }
  async function finish() { setConfirmOpen(false); await completeCarOut(contractId, createIdempotencyKey()); }

  return <div className={styles.handover} data-testid="car-out-handover">
    <div className={styles.context}>
      <div><span>{t("carOut.context.contract")}</span><strong dir="ltr">{detail.contractNumber}</strong></div>
      <div><span>{t("carOut.context.hirer")}</span><strong>{detail.customer?.name ?? "—"}</strong></div>
      <div><span>{t("carOut.context.vehicle")}</span><strong>{detail.vehicle.displayName}</strong></div>
      <div><span>{t("carOut.context.plate")}</span><strong dir="ltr">{detail.vehicle.plateNumber ?? "—"}</strong></div>
      <div><span>{t("carOut.context.status")}</span><strong>{t(`status.${detail.status}`)}</strong></div>
      <div><span>{t("carOut.context.reservation")}</span><strong>{completed ? t("carOut.completed") : t("carOut.awaitingHandover")}</strong></div>
    </div>
    <ContractTarsInlineStatus contractId={contractId} operation="handover" className={styles.integration} />
    {errorMessage ? <><p className={styles.error} role="alert">{errorMessage}</p>{completionMissing.length ? <p className={styles.missing}>{t("carOut.missing", { items: completionMissing.join(", ") })}</p> : null}</> : null}
    {saved ? <p className={styles.saved} role="status">{t("carOut.saved")}</p> : null}
    {completed ? <><ReadOnlyOut detail={detail} handover={handover} t={t} format={format} /><div className={styles.actions}><Button type="button" variant="secondary" size="md" onClick={onClose}>{t("carOut.backToContracts")}</Button></div></> : <>
      <section className={styles.section}><h4>{t("carOut.vehicleOut")}</h4>
        <div className={styles.fields}>
          <label><span>{t("carOut.mileage")}</span><input type="number" min="0" step="1" value={mileage} disabled={!editable || carOutPending} onChange={(e) => setMileage(e.target.value)} /></label>
          <label><span>{t("carOut.notes")}</span><input type="text" maxLength={2000} value={notes} disabled={!editable || carOutPending} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>
        <VehicleConditionSheet side="OUT" damage={damage} fuel={fuel} onDamage={setDamage} onFuel={setFuel} signatureImageUrl={signaturePreviewUrl} onSignature={(image) => { clearSignaturePreview(); setSignature(image); }} editable={editable} />
        {handover.signature.present && !signature ? <p className={styles.signatureSaved}>{t("carOut.signatureSaved")}</p> : null}
      </section>
      <section className={styles.section}><div className={styles.sectionHeader}><h4>{t("carOut.photosTitle")}</h4><span>{t("carOut.progress", { completed: handover.photoEvidence.completed, required: handover.photoEvidence.required })}</span></div>
        {handover.photoEvidence.missing.length ? <p className={styles.missing}>{t("carOut.missing", { items: handover.photoEvidence.missing.map((a) => angleLabel(a)).join(", ") })}</p> : null}
        <div className={styles.photoGrid}>{ALL.map((angle) => { const photo = photos.find((p) => p.angle === angle); return <div className={styles.photoSlot} key={angle}>
          <div className={styles.photoHeading}><span>{angleLabel(angle)}</span><small>{REQUIRED.includes(angle) ? t("carOut.required") : t("carOut.optional")}</small></div>
          {photo ? <ContractInspectionImage path={photo.url} alt={angleLabel(angle)} className={styles.thumbnail} /> : <div className={styles.placeholder}>{t("carOut.notCaptured")}</div>}
          {editable && handover.actions.canUploadPhotos ? <div className={styles.photoActions}><label className={styles.captureButton}>{photo ? t("carOut.retake") : t("carOut.capture")}<input type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadCarOutPhoto(contractId, angle, file); }} /></label>{photo && handover.actions.canDeletePhotos ? <Button type="button" variant="ghost" size="sm" onClick={() => void deleteCarOutPhoto(contractId, photo.id)}>{t("carOut.delete")}</Button> : null}</div> : null}
        </div>; })}</div>
      </section>
      <div className={styles.actions}><Button type="button" variant="secondary" size="md" disabled={!editable || carOutPending} onClick={() => void saveDraft()}>{t("carOut.saveDraft")}</Button><Button type="button" size="md" disabled={!editable || carOutPending || !handover.actions.canComplete} onClick={() => setConfirmOpen(true)}>{t("carOut.complete")}</Button><Button type="button" variant="ghost" size="md" onClick={onClose}>{t("common.cancel")}</Button></div>
    </>}
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("carOut.confirmTitle")} description={t("carOut.confirmDescription")} closeLabel={t("detail.close")}><div className={styles.confirmActions}><Button type="button" variant="ghost" size="md" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button><Button type="button" size="md" onClick={() => void finish()}>{t("carOut.confirm")}</Button></div></Dialog>
  </div>;
}

function ReadOnlyOut({ detail, handover, t, format }: { detail: NonNullable<ReturnType<typeof useContract>["detail"]>; handover: NonNullable<ReturnType<typeof useContract>["carOutHandover"]>; t: ReturnType<typeof useTranslations>; format: ReturnType<typeof useFormatter> }) {
  const angleLabel = (angle: string) => t.has(`carOut.angle.${angle}`) ? t(`carOut.angle.${angle}`) : t(`carOutAngles.${angle}`);
  return <section className={styles.section} data-testid="car-out-readonly"><h4>{t("carOut.completedTitle")}</h4><div className={styles.readOnlyGrid}><div><span>{t("carOut.actualHandover")}</span><strong>{handover.actualHandoverAt ? format.dateTime(new Date(handover.actualHandoverAt), { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong></div><div><span>{t("carOut.mileage")}</span><strong>{handover.mileageOut ?? detail.carOut?.mileageOut ?? "—"}</strong></div><div><span>{t("carOut.fuel")}</span><strong>{handover.fuelOut ?? detail.carOut?.fuelOut ?? "—"}</strong></div></div><div className={styles.readOnlyDamage}><p>{t("carOut.damage")}</p>{handover.damageOut.length ? handover.damageOut.map((mark) => <span key={`${mark.zone}-${mark.type}`}>{mark.zone} · {mark.type}</span>) : <span>{t("carOut.noDamage")}</span>}</div><p className={styles.signatureSaved}>{handover.signature.present ? t("carOut.signatureSaved") : t("carOut.signatureMissing")}</p>{handover.signature.url ? <ContractInspectionImage path={handover.signature.url} alt={t("carOut.signatureSaved")} className={styles.signaturePreview} /> : null}<div className={styles.photoGrid}>{handover.photoEvidence.photos.map((photo) => <div className={styles.photoSlot} key={photo.id}><span className={styles.angleLabel}>{angleLabel(photo.angle)}</span><ContractInspectionImage path={photo.url} alt={angleLabel(photo.angle)} className={styles.thumbnail} /></div>)}</div></section>;
}
