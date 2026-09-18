"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { OfficialContractA4 } from "@/modules/public-rental/components/official-contract-a4/official-contract-a4";
import type { DamageMark, OfficialContractView } from "@/modules/public-rental/types/official-contract.types";
import { VehicleConditionSheet } from "../../components/vehicle-condition-sheet/vehicle-condition-sheet";
import { ContractInspectionImage } from "../../components/contract-inspection-image/contract-inspection-image";
import { ContractTarsInlineStatus } from "../../components/contract-tars/contract-tars-inline-status";
import { useContract } from "../../hooks/use-contract";
import { useSignedContractSignatures } from "../../hooks/use-signed-contract-signatures";
import type { CarOutAngle, FuelLevel } from "../../types/contract.types";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import { signedContractFromSnapshot } from "../../utils/signed-contract-snapshot";
import styles from "./car-out-dialog.module.css";

const REQUIRED: readonly CarOutAngle[] = ["FRONT", "REAR", "FRONT_RIGHT", "REAR_RIGHT", "FRONT_LEFT", "REAR_LEFT", "ODOMETER", "DASHBOARD_FUEL"];
const OPTIONAL: readonly CarOutAngle[] = ["LEFT", "RIGHT", "OTHER"];
const SHEET_WIDTH_PX = (210 / 25.4) * 96;

function SignedContract({ contractId, contract }: { contractId: string; contract: OfficialContractView }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const signatures = useSignedContractSignatures(contractId, contract);
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const update = () => setScale(Math.min(1, Math.max(0.35, (node.clientWidth - 20) / SHEET_WIDTH_PX)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={frame} className={styles.contractViewport}>
    <div className={styles.contractPaper} style={{ zoom: scale }}>
      <OfficialContractA4 contract={contract} mode="READONLY" signatureImageUrl={(slot) => signatures[slot] ?? null} />
    </div>
  </div>;
}

export interface CarOutDialogProps { contractId: string | null; onClose: () => void; }

export function CarOutDialog({ contractId, onClose }: CarOutDialogProps) {
  const t = useTranslations("Contracts");
  return <Dialog open={contractId != null} onClose={onClose} title={t("carOut.title")} description={t("carOut.description")} closeLabel={t("detail.close")} size="wide">
    {contractId ? <CarOutHandover key={contractId} contractId={contractId} onClose={onClose} /> : null}
  </Dialog>;
}

function CarOutHandover({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const t = useTranslations("Contracts");
  const locale = useLocale();
  const format = useFormatter();
  const { detail, detailStatus, carOutHandover, carOutPending, carOutError, loadContract, loadCarOut, saveCarOutDraft, uploadCarOutPhoto, uploadCarOutSignature, deleteCarOutPhoto, completeCarOut } = useContract();
  const [step, setStep] = useState<1 | 2>(1);
  const [loaded, setLoaded] = useState(false);
  const [mileage, setMileage] = useState("");
  const [fuel, setFuel] = useState<FuelLevel | null>(null);
  const [damage, setDamage] = useState<DamageMark[]>([]);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [stepOneSaved, setStepOneSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const previewRef = useRef<string | null>(null);
  const initialized = useRef(false);
  const photoInputs = useRef<Partial<Record<CarOutAngle, HTMLInputElement | null>>>({});
  const uploadInputs = useRef<Partial<Record<CarOutAngle, HTMLInputElement | null>>>({});

  useEffect(() => {
    let active = true;
    void Promise.all([loadContract(contractId), loadCarOut(contractId)]).then(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [contractId, loadContract, loadCarOut]);
  useEffect(() => {
    const savedHandover = carOutHandover ?? detail?.carOutHandover;
    if (!loaded || !savedHandover || initialized.current || detail?.id !== contractId) return;
    initialized.current = true;
    setMileage(savedHandover.mileageOut == null ? "" : String(savedHandover.mileageOut));
    setFuel((savedHandover.fuelOut as FuelLevel | null) ?? null);
    setDamage(savedHandover.damageOut ?? []);
    setNotes(savedHandover.notes ?? "");
    setStepOneSaved(savedHandover.mileageOut != null && savedHandover.fuelOut != null && savedHandover.signature.present);
  }, [loaded, carOutHandover, contractId, detail?.id, detail?.carOutHandover]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);

  const handover = detail?.id === contractId ? (carOutHandover ?? detail.carOutHandover) : null;
  const signedContract = detail?.id === contractId ? signedContractFromSnapshot(detail.snapshot) : null;
  const errorMessage = resolveContractsErrorMessage(t, carOutError);
  if (!loaded || detailStatus === "loading" || !detail || detail.id !== contractId || !handover) {
    return <div className={styles.loading} role="status">{detailStatus === "error" ? (errorMessage ?? t("carOut.loadFailed")) : t("carOut.loading")}</div>;
  }

  const completed = handover.status === "COMPLETED" || detail.status === "ACTIVE";
  const editable = handover.actions.canEdit && detail.status === "PAID";
  const photos = handover.photoEvidence.photos;
  const angleLabel = (angle: CarOutAngle) => t(`carOut.angle.${angle}`);
  const completionMissing = [
    ...(handover.mileageOut == null ? [t("carOut.mileage")] : []),
    ...(handover.fuelOut == null ? [t("carOut.fuel")] : []),
    ...(!handover.signature.present ? [t("carOut.signatureMissing")] : []),
    ...handover.photoEvidence.missing.map(angleLabel),
  ];

  function changeSignature(image: Blob | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = image ? URL.createObjectURL(image) : null;
    previewRef.current = url;
    setSignaturePreviewUrl(url);
    setSignature(image);
    setStepOneSaved(false);
    setSaved(false);
  }

  async function saveDraft(requireCompleteStep = false): Promise<boolean> {
    setSaved(false);
    setValidationError(null);
    const parsedMileage = Number(mileage);
    if (mileage.trim() && (!Number.isInteger(parsedMileage) || parsedMileage < 0)) {
      setValidationError(t("carOut.invalidMileage"));
      return false;
    }
    if (requireCompleteStep && (!mileage.trim() || !fuel || (!signature && !handover!.signature.present))) {
      setValidationError(t("carOut.stepOneRequired"));
      return false;
    }
    const draftSaved = await saveCarOutDraft(contractId, {
      ...(mileage.trim() ? { mileageOut: parsedMileage } : {}),
      ...(fuel ? { fuelOut: fuel } : {}), damageOut: damage, notes: notes || null,
    });
    if (!draftSaved) return false;
    if (signature) {
      const uploaded = await uploadCarOutSignature(contractId, new File([signature], "hirer-out-signature.png", { type: "image/png" }));
      if (!uploaded) return false;
      setSignature(null);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setSignaturePreviewUrl(null);
    }
    setStepOneSaved(Boolean(mileage.trim() && fuel && (signature || handover!.signature.present)));
    setSaved(true);
    return true;
  }

  async function nextToPhotos() {
    if (await saveDraft(true)) setStep(2);
  }
  async function finish() {
    setConfirmOpen(false);
    await completeCarOut(contractId, createIdempotencyKey());
  }

  return <div className={styles.handover} data-testid="car-out-handover">
    <div className={styles.scrollArea}>
      <div className={styles.context}>
        <div><span>{t("carOut.context.contract")}</span><strong dir="ltr">{detail.contractNumber}</strong></div>
        <div><span>{t("carOut.context.hirer")}</span><strong>{signedContract?.hirer.name ?? detail.customer?.name ?? "—"}</strong></div>
        <div><span>{t("carOut.context.vehicle")}</span><strong>{detail.vehicle.displayName}</strong></div>
        <div><span>{t("carOut.context.plate")}</span><strong dir="ltr">{detail.vehicle.plateNumber ?? "—"}</strong></div>
        <div><span>{t("carOut.plateCode")}</span><strong>{signedContract?.vehicle.plateCode ?? "—"}</strong></div>
        <div><span>{t("carOut.color")}</span><strong>{signedContract?.vehicle.color ?? "—"}</strong></div>
        <div><span>{t("carOut.year")}</span><strong>{signedContract?.vehicle.yearMade ?? "—"}</strong></div>
        <div><span>{t("carOut.context.status")}</span><strong>{t(`status.${detail.status}`)}</strong></div>
        <div><span>{t("carOut.paymentStatusLabel")}</span><strong>{detail.payment?.status === "CONFIRMED" ? t("carOut.paymentConfirmed") : "—"}</strong></div>
        <div><span>{t("carOut.vehicleStatusLabel")}</span><strong>{t.has(`carOut.vehicleStatus.${detail.vehicle.operationalStatus}`) ? t(`carOut.vehicleStatus.${detail.vehicle.operationalStatus}`) : "—"}{!completed && detail.status === "PAID" ? ` · ${t("carOut.reserved")}` : ""}</strong></div>
      </div>
      <ContractTarsInlineStatus contractId={contractId} operation="handover" className={styles.integration} />
      {saved ? <p className={styles.saved} role="status">{t("carOut.saved")}</p> : null}
      {completed ? <ReadOnlyOut detail={detail} handover={handover} t={t} format={format} /> : <>
        <nav className={styles.steps} aria-label={t("carOut.stepsLabel")}>
          <span data-active={step === 1}>{t("carOut.stepOne")}</span>
          <span data-active={step === 2}>{t("carOut.stepTwo")}</span>
        </nav>
        {step === 1 ? <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div><h4>{t("carOut.signedContractTitle")}</h4><span>{t("carOut.readOnly")}</span></div>
              {signedContract ? <Button type="button" variant="secondaryStrong" size="md" onClick={() => window.open(`/${locale}/contracts/${contractId}/car-out/contract`, "_blank", "noopener,noreferrer")}>{t("carOut.openFullA4")}</Button> : null}
            </div>
            <p className={styles.help}>{t("carOut.signedContractHint")}</p>
            {signedContract ? <SignedContract contractId={contractId} contract={signedContract} /> : <p className={styles.error} role="alert">{t("carOut.signedContractMissing")}</p>}
          </section>
          <section className={styles.section}>
            <h4>{t("carOut.vehicleOut")}</h4>
            <div className={styles.dataLayout}>
              <VehicleConditionSheet side="OUT" damage={damage} fuel={fuel} onDamage={(marks) => { setDamage(marks); setStepOneSaved(false); }} onFuel={(value) => { setFuel(value); setStepOneSaved(false); }} signatureImageUrl={signaturePreviewUrl} onSignature={changeSignature} editable={editable && !carOutPending} />
              <div className={styles.fieldPanel}>
                <label><span>{t("carOut.mileage")}</span><input type="number" min="0" step="1" inputMode="numeric" value={mileage} disabled={!editable || carOutPending} onChange={(event) => { setMileage(event.target.value); setStepOneSaved(false); }} /></label>
                <p className={styles.help}>{t("carOut.fuelDamageHint")}</p>
                <label><span>{t("carOut.notes")}</span><textarea maxLength={2000} rows={4} value={notes} disabled={!editable || carOutPending} onChange={(event) => { setNotes(event.target.value); setStepOneSaved(false); }} /></label>
                {handover.signature.present && !signature ? <div className={styles.savedSignature}><strong>{t("carOut.signatureSaved")}</strong>{handover.signature.url ? <ContractInspectionImage path={handover.signature.url} alt={t("carOut.signatureSaved")} className={styles.signaturePreview} /> : null}</div> : null}
              </div>
            </div>
          </section>
        </> : <section className={styles.section}>
          <div className={styles.sectionHeader}><h4>{t("carOut.photosTitle")}</h4><strong className={styles.progress}>{t("carOut.progress", { completed: handover.photoEvidence.completed, required: handover.photoEvidence.required })}</strong></div>
          <p className={styles.help}>{t("carOut.photosHint")}</p>
          <div className={styles.progressTrack}><span style={{ width: `${Math.round(100 * handover.photoEvidence.completed / handover.photoEvidence.required)}%` }} /></div>
          {completionMissing.length ? <p className={styles.missing}>{t("carOut.missing", { items: completionMissing.join(", ") })}</p> : null}
          <div className={styles.photoGrid}>{[...REQUIRED, ...OPTIONAL].map((angle) => {
            const photo = photos.find((item) => item.angle === angle);
            return <div className={styles.photoSlot} key={angle}>
              <div className={styles.photoHeading}><strong>{angleLabel(angle)}</strong><small>{REQUIRED.includes(angle) ? t("carOut.required") : t("carOut.optional")}</small></div>
              {photo ? <ContractInspectionImage path={photo.url} alt={angleLabel(angle)} className={styles.thumbnail} /> : <div className={styles.placeholder}>{t("carOut.notCaptured")}</div>}
              {editable && handover.actions.canUploadPhotos ? <div className={styles.photoActions}>
                <input ref={(node) => { photoInputs.current[angle] = node; }} type="file" accept="image/*" capture="environment" tabIndex={-1} className={styles.fileInput} aria-label={angleLabel(angle)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadCarOutPhoto(contractId, angle, file); }} />
                <input ref={(node) => { uploadInputs.current[angle] = node; }} type="file" accept="image/*" tabIndex={-1} className={styles.fileInput} aria-label={`${t("carOut.upload")} ${angleLabel(angle)}`} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadCarOutPhoto(contractId, angle, file); }} />
                <Button type="button" variant="secondary" size="sm" disabled={carOutPending} onClick={() => photoInputs.current[angle]?.click()}>{photo ? t("carOut.retake") : t("carOut.capture")}</Button>
                <Button type="button" variant="secondary" size="sm" disabled={carOutPending} onClick={() => uploadInputs.current[angle]?.click()}>{photo ? t("carOut.replacePhoto") : t("carOut.upload")}</Button>
                {photo && handover.actions.canDeletePhotos ? <Button type="button" variant="ghost" size="sm" disabled={carOutPending} onClick={() => void deleteCarOutPhoto(contractId, photo.id)}>{t("carOut.delete")}</Button> : null}
              </div> : null}
            </div>;
          })}</div>
        </section>}
      </>}
    </div>
    <div className={styles.actions}>
      {errorMessage || validationError ? <p className={`${styles.error} ${styles.actionError}`} role="alert">{validationError ?? errorMessage}</p> : null}
      <Button type="button" variant="secondary" size="md" onClick={onClose}>{t("detail.close")}</Button>
      {!completed && editable ? <>
        {step === 2 ? <><Button type="button" variant="secondary" size="md" onClick={() => setStep(1)}>{t("carOut.backToData")}</Button><Button type="button" variant="secondary" size="md" disabled={carOutPending} onClick={() => void saveDraft()}>{t("carOut.saveDraft")}</Button></> : <>
          <Button type="button" variant="secondary" size="md" disabled={carOutPending} onClick={() => void saveDraft()}>{t("carOut.saveDraft")}</Button>
          <Button type="button" variant="secondaryStrong" size="md" disabled={carOutPending || !signedContract} onClick={() => void nextToPhotos()}>{t("carOut.nextToPhotos")}</Button>
        </>}
        {step === 2 ? <Button type="button" size="md" disabled={carOutPending || !stepOneSaved || !handover.actions.canComplete} onClick={() => setConfirmOpen(true)}>{t("carOut.complete")}</Button> : null}
      </> : null}
    </div>
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("carOut.confirmTitle")} description={t("carOut.confirmDescription")} closeLabel={t("detail.close")}>
      <div className={styles.confirmActions}><Button type="button" variant="secondary" size="md" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button><Button type="button" size="md" onClick={() => void finish()}>{t("carOut.confirm")}</Button></div>
    </Dialog>
  </div>;
}

function ReadOnlyOut({ detail, handover, t, format }: { detail: NonNullable<ReturnType<typeof useContract>["detail"]>; handover: NonNullable<ReturnType<typeof useContract>["carOutHandover"]>; t: ReturnType<typeof useTranslations>; format: ReturnType<typeof useFormatter> }) {
  const angleLabel = (angle: CarOutAngle) => t(`carOut.angle.${angle}`);
  return <section className={styles.section} data-testid="car-out-readonly"><h4>{t("carOut.completedTitle")}</h4><div className={styles.readOnlyGrid}><div><span>{t("carOut.actualHandover")}</span><strong>{handover.actualHandoverAt ? format.dateTime(new Date(handover.actualHandoverAt), { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong></div><div><span>{t("carOut.mileage")}</span><strong>{handover.mileageOut ?? detail.carOut?.mileageOut ?? "—"}</strong></div><div><span>{t("carOut.fuel")}</span><strong>{handover.fuelOut ?? detail.carOut?.fuelOut ?? "—"}</strong></div></div><div className={styles.readOnlyDamage}><p>{t("carOut.damage")}</p>{handover.damageOut.length ? handover.damageOut.map((mark) => <span key={`${mark.zone}-${mark.type}`}>{mark.zone} · {mark.type}</span>) : <span>{t("carOut.noDamage")}</span>}</div><p className={styles.saved}>{handover.signature.present ? t("carOut.signatureSaved") : t("carOut.signatureMissing")}</p>{handover.signature.url ? <ContractInspectionImage path={handover.signature.url} alt={t("carOut.signatureSaved")} className={styles.signaturePreview} /> : null}<div className={styles.photoGrid}>{handover.photoEvidence.photos.map((photo) => <div className={styles.photoSlot} key={photo.id}><span className={styles.angleLabel}>{angleLabel(photo.angle as CarOutAngle)}</span><ContractInspectionImage path={photo.url} alt={angleLabel(photo.angle as CarOutAngle)} className={styles.thumbnail} /></div>)}</div></section>;
}
