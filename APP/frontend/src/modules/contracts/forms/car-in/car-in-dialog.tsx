"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { useOperatingCompanies } from "@/modules/operating-companies";
import type { DamageMark } from "@/modules/public-rental/types/official-contract.types";
import { VehicleConditionSheet } from "../../components/vehicle-condition-sheet/vehicle-condition-sheet";
import { ContractInspectionImage } from "../../components/contract-inspection-image/contract-inspection-image";
import { ContractTarsInlineStatus } from "../../components/contract-tars/contract-tars-inline-status";
import { CustodyLedger, type LedgerTarget } from "../custody/custody-ledger";
import { CustodyPhotoGrid } from "../custody/custody-photos";
import { CUSTODY_OPTIONAL_ANGLES, CUSTODY_REQUIRED_ANGLES } from "../custody/custody-angles";
import { buildCarInDraftPatch, validateCustodyStepOne } from "../custody/custody-draft";
import { useContract } from "../../hooks/use-contract";
import type { CarOutAngle, FuelLevel } from "../../types/contract.types";
import { createIdempotencyKey } from "../../utils/contract-link";
import { resolveContractsErrorMessage } from "../../utils/resolve-contracts-error";
import { signedContractFromSnapshot } from "../../utils/signed-contract-snapshot";
import styles from "../custody/custody-dialog.module.css";

const REQUIRED = CUSTODY_REQUIRED_ANGLES;
const OPTIONAL = CUSTODY_OPTIONAL_ANGLES;

export interface CarInDialogProps { contractId: string | null; onClose: () => void; }

export function CarInDialog({ contractId, onClose }: CarInDialogProps) {
  const t = useTranslations("Contracts");
  return <Dialog open={contractId != null} onClose={onClose} title={t("carIn.title")} closeLabel={t("detail.close")} size="wide">
    {contractId ? <CarInReturn key={contractId} contractId={contractId} onClose={onClose} /> : null}
  </Dialog>;
}

/**
 * Staged Car-In: the return side of the custody workflow, step for step the
 * same as Car-Out — return details and hirer signature first, then the
 * walk-around photos — with the draft living on the server until completion.
 */
function CarInReturn({ contractId, onClose }: { contractId: string; onClose: () => void }) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const { detail, detailStatus, carInHandover, carInPending, carInError, loadContract, loadCarIn, saveCarInDraft, uploadCarInPhoto, uploadCarInSignature, deleteCarInPhoto, completeCarIn } = useContract();
  const { companies } = useOperatingCompanies();
  const [step, setStep] = useState<1 | 2>(1);
  const [loaded, setLoaded] = useState(false);
  const [mileage, setMileage] = useState("");
  const [fuel, setFuel] = useState<FuelLevel | null>(null);
  const [damage, setDamage] = useState<DamageMark[]>([]);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const focusTarget = useRef<string | null>(null);
  const [, setFocusRequest] = useState(0);
  const previewRef = useRef<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([loadContract(contractId), loadCarIn(contractId)]).then(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [contractId, loadContract, loadCarIn]);
  // Restore the saved draft once, so reopening resumes exactly where the return stopped.
  useEffect(() => {
    const savedReturn = carInHandover ?? detail?.carInHandover;
    if (!loaded || !savedReturn || initialized.current || detail?.id !== contractId) return;
    initialized.current = true;
    setMileage(savedReturn.mileageIn == null ? "" : String(savedReturn.mileageIn));
    setFuel((savedReturn.fuelIn as FuelLevel | null) ?? null);
    setDamage(savedReturn.damageIn ?? []);
    setNotes(savedReturn.notes ?? "");
  }, [loaded, carInHandover, contractId, detail?.id, detail?.carInHandover]);
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  // Ledger navigation: once the target step has rendered, bring the requirement into view and focus it.
  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    const node = document.getElementById(`car-in-target-${target}`);
    if (!node) return;
    focusTarget.current = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    node.focus({ preventScroll: true });
  });

  const handover = detail?.id === contractId ? (carInHandover ?? detail.carInHandover) : null;
  const historicalCompany = detail?.id === contractId
    ? companies.find((company) => company.id === detail.company.id)
    : undefined;
  const signedContract = detail?.id === contractId
    ? signedContractFromSnapshot(detail.snapshot, historicalCompany)
    : null;
  const errorMessage = resolveContractsErrorMessage(t, carInError);
  if (!loaded || detailStatus === "loading" || !detail || detail.id !== contractId || !handover) {
    return <div className={styles.loading} role="status">{detailStatus === "error" ? (errorMessage ?? t("carIn.loadFailed")) : t("carIn.loading")}</div>;
  }

  // Car-In ends custody: past RETOUT the return is recorded and read-only here.
  const completed = handover.status === "COMPLETED" || detail.status !== "RETOUT";
  const editable = handover.actions.canEdit && detail.status === "RETOUT";
  const photos = handover.photoEvidence.photos;
  const plateNumber = detail.vehicle.plateNumber ?? signedContract?.vehicle.plateNumber ?? null;
  const plateCode = signedContract?.vehicle.plateCode ?? null;
  const plate = plateCode && !plateNumber?.includes(plateCode) ? [plateCode, plateNumber].filter(Boolean).join(" ") : plateNumber;
  const vehicleMeta = [signedContract?.vehicle.color, signedContract?.vehicle.yearMade].filter((part) => part != null && part !== "").join(" · ");
  const vehicleStatus = t.has(`carIn.vehicleStatus.${detail.vehicle.operationalStatus}`) ? t(`carIn.vehicleStatus.${detail.vehicle.operationalStatus}`) : "—";

  function changeSignature(image: Blob | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = image ? URL.createObjectURL(image) : null;
    previewRef.current = url;
    setSignaturePreviewUrl(url);
    setSignature(image);
    setSaved(false);
  }

  async function saveDraft(requireCompleteStep = false): Promise<boolean> {
    setSaved(false);
    setValidationError(null);
    const issue = validateCustodyStepOne(
      { mileage, fuel, signatureDrawn: signature != null, signaturePresent: handover!.signature.present },
      requireCompleteStep,
    );
    if (issue) {
      setValidationError(t(`carIn.${issue}`));
      return false;
    }
    const draftSaved = await saveCarInDraft(contractId, buildCarInDraftPatch({ mileage, fuel, damage, notes }));
    if (!draftSaved) return false;
    if (signature) {
      const uploaded = await uploadCarInSignature(contractId, new File([signature], "hirer-in-signature.png", { type: "image/png" }));
      if (!uploaded) return false;
      setSignature(null);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
      setSignaturePreviewUrl(null);
    }
    setSaved(true);
    return true;
  }

  async function nextToPhotos(): Promise<boolean> {
    const ok = await saveDraft(true);
    if (ok) setStep(2);
    return ok;
  }
  async function goTo(target: LedgerTarget) {
    const photo = (REQUIRED as readonly string[]).includes(target);
    if (photo && step === 1) {
      if (editable) { if (!(await nextToPhotos())) return; } else setStep(2);
    } else if (!photo && step === 2) setStep(1);
    focusTarget.current = photo ? target : target === "mileage" ? "mileage" : "sheet";
    setFocusRequest((request) => request + 1);
  }
  async function finish() {
    setConfirmOpen(false);
    await completeCarIn(contractId, createIdempotencyKey());
  }

  return <div className={styles.handover} data-testid="car-in-return">
      <header className={styles.context}>
        <div className={styles.identity}>
          <div className={styles.vehicle}>
            <div className={styles.vehicleTitleLine}>
              <strong className={styles.vehicleName}>{detail.vehicle.displayName}</strong>
              <CompanyIdentity company={detail.company} />
            </div>
            <div className={styles.vehicleMeta}>
              {plate ? <span className={styles.plate} dir="ltr" aria-label={`${t("carIn.context.plate")} ${plate}`}>{plate}</span> : null}
              {vehicleMeta ? <span>{vehicleMeta}</span> : null}
            </div>
          </div>
          <dl className={styles.parties}>
            <div><dt>{t("carIn.context.contract")}</dt><dd dir="ltr">{detail.contractNumber}</dd></div>
            <div><dt>{t("carIn.context.hirer")}</dt><dd>{signedContract?.hirer.name ?? detail.customer?.name ?? "—"}</dd></div>
          </dl>
        </div>
        <div className={styles.statusLine}>
          <Chip tone="gold" dot><span className={styles.chipLabel}>{t("carIn.context.status")}</span>{t(`status.${detail.status}`)}</Chip>
          <Chip tone={detail.vehicle.operationalStatus === "RENTED" ? "gold" : "neutral"} dot><span className={styles.chipLabel}>{t("carIn.vehicleStatusLabel")}</span>{vehicleStatus}</Chip>
          {completed ? <ContractTarsInlineStatus contractId={contractId} operation="returnDocumentation" className={styles.integration} /> : null}
        </div>
      </header>
    <div className={styles.body}>
    <div className={styles.scrollArea}>
      {saved ? <p className={styles.saved} role="status">{t("carIn.saved")}</p> : null}
      {completed ? <ReadOnlyIn detail={detail} handover={handover} t={t} format={format} /> : <>
        {step === 1 ? <section className={styles.section}>
          <h4>{t("carIn.vehicleIn")}</h4>
          <p className={styles.help}>{t("carIn.returnHint")}</p>
          <div className={styles.dataLayout}>
            <div id="car-in-target-sheet" tabIndex={-1} className={styles.sheetTarget}><VehicleConditionSheet side="IN" damage={damage} fuel={fuel} onDamage={(marks) => { setDamage(marks); setSaved(false); }} onFuel={(value) => { setFuel(value); setSaved(false); }} signatureImageUrl={signaturePreviewUrl} onSignature={changeSignature} editable={editable && !carInPending} /></div>
            <div className={styles.fieldPanel}>
              <label><span>{t("carIn.mileage")}</span><input id="car-in-target-mileage" type="number" min="0" step="1" inputMode="numeric" value={mileage} disabled={!editable || carInPending} onChange={(event) => { setMileage(event.target.value); setSaved(false); }} /></label>
              <p className={styles.help}>{t("carIn.fuelDamageHint")}</p>
              <label><span>{t("carIn.notes")}</span><textarea maxLength={2000} rows={4} value={notes} disabled={!editable || carInPending} onChange={(event) => { setNotes(event.target.value); setSaved(false); }} /></label>
              {handover.signature.present && !signature ? <div className={styles.savedSignature}><strong>{t("carIn.signatureSaved")}</strong>{handover.signature.url ? <ContractInspectionImage path={handover.signature.url} alt={t("carIn.signatureSaved")} className={styles.signaturePreview} /> : null}</div> : null}
            </div>
          </div>
        </section> : <CustodyPhotoGrid
          namespace="Contracts.carIn"
          idPrefix="car-in"
          required={REQUIRED}
          optional={OPTIONAL}
          photos={photos}
          progress={handover.photoEvidence}
          editable={editable}
          canUpload={handover.actions.canUploadPhotos}
          canDelete={handover.actions.canDeletePhotos}
          pending={carInPending}
          onUpload={(angle, file) => void uploadCarInPhoto(contractId, angle, file)}
          onDelete={(photoId) => void deleteCarInPhoto(contractId, photoId)}
        />}
      </>}
    </div>
    {completed ? null : <CustodyLedger
      namespace="Contracts.carIn"
      saved={{ mileage: handover.mileageIn, fuel: handover.fuelIn, damage: handover.damageIn, signaturePresent: handover.signature.present }}
      angles={REQUIRED}
      photoEvidence={handover.photoEvidence}
      draft={{ mileage, fuel, damage, signatureDrawn: signature != null }}
      step={step}
      photosReachable
      onSelect={(target) => void goTo(target)}
      footer={<ContractTarsInlineStatus contractId={contractId} operation="returnDocumentation" />}
    />}
    </div>
    <div className={styles.actions}>
      {errorMessage || validationError ? <p className={`${styles.error} ${styles.actionError}`} role="alert">{validationError ?? errorMessage}</p> : null}
      <Button type="button" variant="secondary" size="md" onClick={onClose}>{t("detail.close")}</Button>
      {!completed && editable ? <>
        {step === 2 ? <><Button type="button" variant="secondary" size="md" onClick={() => setStep(1)}>{t("carIn.backToData")}</Button><Button type="button" variant="secondary" size="md" disabled={carInPending} onClick={() => void saveDraft()}>{t("carIn.saveDraft")}</Button></> : <>
          <Button type="button" variant="secondary" size="md" disabled={carInPending} onClick={() => void saveDraft()}>{t("carIn.saveDraft")}</Button>
          <Button type="button" variant="secondaryStrong" size="md" disabled={carInPending} onClick={() => void nextToPhotos()}>{t("carIn.nextToPhotos")}</Button>
        </>}
        {step === 2 ? <Button type="button" size="md" disabled={carInPending || !handover.actions.canComplete} onClick={() => setConfirmOpen(true)}>{t("carIn.complete")}</Button> : null}
      </> : null}
    </div>
    <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("carIn.confirmTitle")} description={t("carIn.confirmDescription")} closeLabel={t("detail.close")}>
      <div className={styles.confirmActions}><Button type="button" variant="secondary" size="md" onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button><Button type="button" size="md" onClick={() => void finish()}>{t("carIn.confirm")}</Button></div>
    </Dialog>
  </div>;
}

function ReadOnlyIn({ detail, handover, t, format }: { detail: NonNullable<ReturnType<typeof useContract>["detail"]>; handover: NonNullable<ReturnType<typeof useContract>["carInHandover"]>; t: ReturnType<typeof useTranslations>; format: ReturnType<typeof useFormatter> }) {
  const angleLabel = (angle: CarOutAngle) => t(`carIn.angle.${angle}`);
  return <section className={styles.section} data-testid="car-in-readonly"><h4>{t("carIn.completedTitle")}</h4><div className={styles.readOnlyGrid}><div><span>{t("carIn.actualReturn")}</span><strong>{handover.actualReturnAt ? format.dateTime(new Date(handover.actualReturnAt), { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong></div><div><span>{t("carIn.mileage")}</span><strong>{handover.mileageIn ?? detail.carIn?.mileageIn ?? "—"}</strong></div><div><span>{t("carIn.fuel")}</span><strong>{handover.fuelIn ?? detail.carIn?.fuelIn ?? "—"}</strong></div></div><div className={styles.readOnlyDamage}><p>{t("carIn.damage")}</p>{handover.damageIn.length ? handover.damageIn.map((mark) => <span key={`${mark.zone}-${mark.type}`}>{mark.zone} · {mark.type}</span>) : <span>{t("carIn.noDamage")}</span>}</div><p className={styles.saved}>{handover.signature.present ? t("carIn.signatureSaved") : t("carIn.signatureMissing")}</p>{handover.signature.url ? <ContractInspectionImage path={handover.signature.url} alt={t("carIn.signatureSaved")} className={styles.signaturePreview} /> : null}<div className={styles.photoGrid}>{handover.photoEvidence.photos.map((photo) => <div className={styles.photoSlot} key={photo.id}><span className={styles.angleLabel}>{angleLabel(photo.angle as CarOutAngle)}</span><ContractInspectionImage path={photo.url} alt={angleLabel(photo.angle as CarOutAngle)} className={styles.thumbnail} /></div>)}</div></section>;
}
