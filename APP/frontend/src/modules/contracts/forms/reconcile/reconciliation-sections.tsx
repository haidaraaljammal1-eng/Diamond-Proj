"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Chip } from "@/shared/components/ui/chip";
import { Dialog } from "@/shared/components/ui/dialog";
import { Icon } from "@/shared/components/ui/icon";
import { Input } from "@/shared/components/ui/input";
import type {
  FullReconciliationReadDto,
  ReconciliationLineDto,
  ReconciliationRoadLiabilityDto,
} from "../../types/reconciliation.types";
import {
  damageLines,
  fuelLines,
  isReconciliationAwaitingPayment,
  isReconciliationEditable,
  manualChargeLines,
  roadLiabilityTypeKey,
  totalsEntries,
} from "../../utils/reconciliation.utils";
import {
  formatFuelDifferenceEighths,
  formatFuelLevelEighths,
} from "../../utils/reconciliation-fuel-format";
import styles from "./reconcile-dialog.module.css";

const SECTION_IDS = {
  photos: "reconciliation-photos",
  custody: "reconciliation-custody",
  liabilities: "reconciliation-liabilities",
  damage: "reconciliation-damage",
  summary: "reconciliation-summary",
} as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ReconciliationSectionNav({
  hasPhotos,
  hasLiabilities,
}: {
  hasPhotos: boolean;
  hasLiabilities: boolean;
}) {
  const t = useTranslations("Contracts");
  const items: Array<{ id: string; label: string }> = [];
  if (hasPhotos) {
    items.push({ id: SECTION_IDS.photos, label: t("finalReconciliation.sectionNav.photos") });
  }
  items.push({ id: SECTION_IDS.custody, label: t("finalReconciliation.sectionNav.custody") });
  if (hasLiabilities) {
    items.push({ id: SECTION_IDS.liabilities, label: t("finalReconciliation.sectionNav.liabilities") });
  }
  items.push({ id: SECTION_IDS.damage, label: t("finalReconciliation.sectionNav.damage") });
  items.push({ id: SECTION_IDS.summary, label: t("finalReconciliation.sectionNav.summary") });

  return (
    <nav className={styles.sectionNav} aria-label={t("finalReconciliation.sectionNav.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.sectionNavLink}
          onClick={() => scrollToSection(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function reconciliationStatusChip(data: FullReconciliationReadDto): {
  tone: "ok" | "warn" | "gold" | "neutral";
  labelKey: string;
} {
  if (data.reconciliation.settled) return { tone: "ok", labelKey: "completed" };
  if (data.contract.status === "CLOSED") return { tone: "neutral", labelKey: "historicalRecord" };
  if (isReconciliationAwaitingPayment(data)) return { tone: "warn", labelKey: "awaitingPayment" };
  if (data.reconciliation.finalizedAt) return { tone: "gold", labelKey: "finalizedLocked" };
  return { tone: "gold", labelKey: "draft" };
}

export function ReconciliationHeader({ data }: { data: FullReconciliationReadDto }) {
  const t = useTranslations("Contracts");
  const { contract } = data;
  const status = reconciliationStatusChip(data);
  const statusLabel = t(
    `finalReconciliation.${status.labelKey}` as
      | "finalReconciliation.completed"
      | "finalReconciliation.awaitingPayment"
      | "finalReconciliation.finalizedLocked"
      | "finalReconciliation.draft"
      | "finalReconciliation.historicalRecord",
  );

  return (
    <header className={styles.header} data-testid="reconciliation-header">
      <div className={styles.headerMain}>
        <h2 className={styles.dialogTitle}>{t("finalReconciliation.title")}</h2>
        <p className={styles.headerMetaLine}>
          <span dir="ltr">{contract.contractNumber}</span>
          <span aria-hidden="true">·</span>
          <span>{contract.vehicle.displayName}</span>
          {contract.vehicle.plateNumber ? (
            <>
              <span aria-hidden="true">·</span>
              <span dir="ltr">{contract.vehicle.plateNumber}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className={styles.headerStatus}>
        <Chip tone={status.tone} dot data-testid="reconciliation-status">
          {statusLabel}
        </Chip>
      </div>
    </header>
  );
}

export function ReconciliationHistoricalBanner({ data }: { data: FullReconciliationReadDto }) {
  const t = useTranslations("Contracts");
  if (data.contract.status !== "CLOSED") return null;
  return <p className={styles.historicalNote}>{t("finalReconciliation.historicalRecord")}</p>;
}

export function ReconciliationCustodySection({ custody }: { custody: FullReconciliationReadDto["custody"] }) {
  const t = useTranslations("Contracts");
  const format = useFormatter();

  const mileageDiff =
    custody.mileageDifference != null
      ? `${custody.mileageDifference >= 0 ? "+" : ""}${format.number(custody.mileageDifference)} km`
      : "—";

  const fuelDiff = formatFuelDifferenceEighths(custody.fuelDifference);
  const fuelDiffNegative = custody.fuelDifference != null && custody.fuelDifference < 0;

  return (
    <section
      id={SECTION_IDS.custody}
      className={styles.section}
      data-testid="reconciliation-custody"
    >
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.vehicleReturnData")}</h3>
      <table className={styles.metricTable} data-testid="reconciliation-metric-table">
        <colgroup>
          <col className={styles.metricColLabel} />
          <col className={styles.metricColNum} span={3} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={styles.labelCol} />
            <th scope="col" className={styles.numCol} data-testid="reconciliation-metric-header-car-out">
              {t("finalReconciliation.carOut")}
            </th>
            <th scope="col" className={styles.numCol} data-testid="reconciliation-metric-header-car-in">
              {t("finalReconciliation.carIn")}
            </th>
            <th scope="col" className={styles.numCol} data-testid="reconciliation-metric-header-difference">
              {t("finalReconciliation.difference")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t("finalReconciliation.mileage")}</th>
            <td className={styles.numCol} data-testid="reconciliation-metric-mileage-car-out">
              <span className={styles.metricValue} dir="ltr">
                {custody.mileageOut != null ? format.number(custody.mileageOut) : "—"}
              </span>
            </td>
            <td className={styles.numCol} data-testid="reconciliation-metric-mileage-car-in">
              <span className={styles.metricValue} dir="ltr">
                {custody.mileageIn != null ? format.number(custody.mileageIn) : "—"}
              </span>
            </td>
            <td className={styles.numCol} data-testid="reconciliation-metric-mileage-difference">
              <span
                className={`${styles.metricValue} ${styles.metricDifferenceHighlight}`}
                data-danger="true"
                dir="ltr"
              >
                {mileageDiff}
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">{t("finalReconciliation.fuel")}</th>
            <td className={styles.numCol} data-testid="reconciliation-metric-fuel-car-out">
              <span className={styles.metricValue} dir="ltr">
                {formatFuelLevelEighths(custody.fuelOut)}
              </span>
            </td>
            <td className={styles.numCol} data-testid="reconciliation-metric-fuel-car-in">
              <span className={styles.metricValue} dir="ltr">
                {formatFuelLevelEighths(custody.fuelIn)}
              </span>
            </td>
            <td className={styles.numCol} data-testid="reconciliation-metric-fuel-difference">
              <span
                className={`${styles.metricValue}${fuelDiffNegative ? ` ${styles.metricDifferenceHighlight}` : ""}`}
                data-danger={fuelDiffNegative ? "true" : undefined}
                dir="ltr"
              >
                {fuelDiff}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function RoadLiabilityTable({
  items,
  showReview,
  editable,
  confirmPending,
  onConfirm,
}: {
  items: ReconciliationRoadLiabilityDto[];
  showReview: boolean;
  editable: boolean;
  confirmPending: boolean;
  onConfirm?: (id: string, amount: number) => void;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();

  return (
    <div className={styles.liabilityTableWrap}>
      <table className={styles.liabilityTable}>
        <colgroup>
          <col className={styles.liabilityColType} />
          <col className={styles.liabilityColDate} />
          <col className={styles.liabilityColReference} />
          <col className={styles.liabilityColAmount} span={3} />
          {showReview && editable ? <col className={styles.liabilityColActions} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t("finalReconciliation.columnType")}</th>
            <th scope="col">{t("finalReconciliation.columnDate")}</th>
            <th scope="col">{t("finalReconciliation.columnReference")}</th>
            <th scope="col" className={styles.liabilityAmount} data-testid="reconciliation-liability-header-official">
              {t("finalReconciliation.officialAmount")}
            </th>
            <th scope="col" className={styles.liabilityAmount} data-testid="reconciliation-liability-header-admin">
              {t("finalReconciliation.adminFee")}
            </th>
            <th scope="col" className={styles.liabilityAmount} data-testid="reconciliation-liability-header-charge">
              {t("finalReconciliation.customerCharge")}
            </th>
            {showReview && editable ? <th scope="col" /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} data-testid={`road-liability-${item.id}`}>
              <td className={styles.liabilityType}>
                {t(`finalReconciliation.${roadLiabilityTypeKey(item.type)}`)}
                {showReview && !item.attached ? (
                  <span className={styles.needsReviewChip}>{t("finalReconciliation.needsReview")}</span>
                ) : null}
              </td>
              <td dir="ltr">
                {format.dateTime(new Date(item.occurredAt), { dateStyle: "medium" })}
              </td>
              <td dir="ltr">{item.externalReference ?? "—"}</td>
              <td className={styles.liabilityAmount} data-testid={`reconciliation-liability-official-${item.id}`}>
                <span className={styles.liabilityNumeric} dir="ltr">
                  {format.number(item.officialAmount)}
                </span>
              </td>
              <td className={styles.liabilityAmount} data-testid={`reconciliation-liability-admin-${item.id}`}>
                <span className={styles.liabilityNumeric} dir="ltr">
                  {item.adminFee > 0 ? format.number(item.adminFee) : "—"}
                </span>
              </td>
              <td className={styles.liabilityAmount} data-testid={`reconciliation-liability-charge-${item.id}`}>
                <span className={styles.liabilityNumeric} dir="ltr">
                  {format.number(item.customerCharge)}
                </span>
              </td>
              {showReview && editable && onConfirm ? (
                <td className={styles.liabilityActions}>
                  {!item.attached ? (
                    <Button
                      type="button"
                      size="sm"
                      loading={confirmPending}
                      onClick={() => onConfirm(item.id, item.customerCharge)}
                    >
                      {t("finalReconciliation.confirmCharge")}
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReconciliationRoadLiabilitiesSection({
  data,
  confirmPending,
  onConfirm,
}: {
  data: FullReconciliationReadDto;
  confirmPending: boolean;
  onConfirm?: (id: string, amount: number) => void;
}) {
  const t = useTranslations("Contracts");
  const editable = isReconciliationEditable(data);
  const { attached, available } = data.roadLiabilities;

  if (attached.length === 0 && available.length === 0) {
    return (
      <section
        id={SECTION_IDS.liabilities}
        className={styles.section}
        data-testid="reconciliation-road-liabilities"
      >
        <h3 className={styles.sectionTitle}>{t("finalReconciliation.roadLiabilities")}</h3>
        <p className={styles.muted}>{t("finalReconciliation.noRoadLiabilities")}</p>
      </section>
    );
  }

  return (
    <section
      id={SECTION_IDS.liabilities}
      className={styles.section}
      data-testid="reconciliation-road-liabilities"
    >
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.roadLiabilities")}</h3>

      {available.length > 0 ? (
        <>
          <div className={styles.reviewBanner} role="status">
            <Icon name="mdi:alert-circle-outline" size={18} className={styles.reviewBannerIcon} />
            <div>
              <strong>{t("finalReconciliation.needsReviewTitle")}</strong>
              <p>{t("finalReconciliation.needsReviewCount", { count: available.length })}</p>
            </div>
          </div>
          <RoadLiabilityTable
            items={available}
            showReview
            editable={editable}
            confirmPending={confirmPending}
            onConfirm={onConfirm}
          />
        </>
      ) : null}

      {attached.length > 0 ? (
        <>
          <p className={styles.groupLabel}>{t("finalReconciliation.attachedLiabilities")}</p>
          <RoadLiabilityTable items={attached} showReview={false} editable={false} confirmPending={false} />
        </>
      ) : null}
    </section>
  );
}

export function ReconciliationReturnChargesSection({
  data,
  linePending,
  onAddDamage,
  onUpdateDamage,
  onDeleteDamage,
  onAddFuel,
  onUpdateFuel,
  onDeleteFuel,
}: {
  data: FullReconciliationReadDto;
  linePending: boolean;
  onAddDamage: (location: string, amount: number) => void;
  onUpdateDamage: (line: ReconciliationLineDto, location: string, amount: number) => void;
  onDeleteDamage: (lineId: string) => void;
  onAddFuel: (amount: number) => void;
  onUpdateFuel: (line: ReconciliationLineDto, amount: number) => void;
  onDeleteFuel: (lineId: string) => void;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const editable = isReconciliationEditable(data);
  const damages = damageLines(data.lines);
  const fuel = fuelLines(data.lines);
  const charges = manualChargeLines(data.lines);
  const [damageFormOpen, setDamageFormOpen] = useState(false);
  const [fuelFormOpen, setFuelFormOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [fuelAmount, setFuelAmount] = useState("");
  const [editDamageId, setEditDamageId] = useState<string | null>(null);
  const [editFuelId, setEditFuelId] = useState<string | null>(null);

  useEffect(() => {
    if (!editable) {
      setDamageFormOpen(false);
      setFuelFormOpen(false);
      setEditDamageId(null);
      setEditFuelId(null);
    }
  }, [editable]);

  const resetDamageForm = () => {
    setLocation("");
    setAmount("");
    setEditDamageId(null);
    setDamageFormOpen(false);
  };

  const resetFuelForm = () => {
    setFuelAmount("");
    setEditFuelId(null);
    setFuelFormOpen(false);
  };

  const startEditDamage = (line: ReconciliationLineDto) => {
    setEditDamageId(line.id);
    setLocation(line.description);
    setAmount(String(line.amount));
    setDamageFormOpen(true);
  };

  const startEditFuel = (line: ReconciliationLineDto) => {
    setEditFuelId(line.id);
    setFuelAmount(String(line.amount));
    setFuelFormOpen(true);
  };

  const submitDamage = () => {
    const parsed = Number.parseInt(amount, 10);
    if (!location.trim() || !Number.isFinite(parsed) || parsed < 0) return;
    if (editDamageId) {
      const line = damages.find((item) => item.id === editDamageId);
      if (!line) return;
      onUpdateDamage(line, location.trim(), parsed);
    } else {
      onAddDamage(location.trim(), parsed);
    }
    resetDamageForm();
  };

  const submitFuel = () => {
    const parsed = Number.parseInt(fuelAmount, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (editFuelId) {
      const line = fuel.find((item) => item.id === editFuelId);
      if (!line) return;
      onUpdateFuel(line, parsed);
    } else {
      onAddFuel(parsed);
    }
    resetFuelForm();
  };

  return (
    <section id={SECTION_IDS.damage} className={styles.section} data-testid="reconciliation-return-charges">
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.returnDamagesAndCosts")}</h3>

      {editable ? (
        <div className={styles.returnChargeActions}>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="reconciliation-add-damage"
            onClick={() => {
              resetDamageForm();
              setDamageFormOpen(true);
            }}
          >
            {t("finalReconciliation.addDamage")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="reconciliation-add-fuel"
            onClick={() => {
              if (fuel[0]) {
                startEditFuel(fuel[0]);
                return;
              }
              resetFuelForm();
              setFuelFormOpen(true);
            }}
          >
            {fuel[0] ? t("finalReconciliation.editFuelCharge") : t("finalReconciliation.addFuelCharge")}
          </Button>
        </div>
      ) : null}

      {charges.length > 0 ? (
        <ul className={styles.damageList}>
          {charges.map((line) => (
            <li
              key={line.id}
              className={styles.damageItem}
              data-testid={line.type === "FUEL" ? `fuel-line-${line.id}` : `damage-line-${line.id}`}
            >
              <div className={styles.damageMain}>
                <strong>
                  {line.type === "FUEL" ? t("finalReconciliation.fuelChargeLabel") : line.description}
                </strong>
                <span className={styles.damageAmount} dir="ltr">
                  {format.number(line.amount)} AED
                </span>
              </div>
              {editable ? (
                <div className={styles.damageActions}>
                  <button
                    type="button"
                    className={styles.iconAction}
                    aria-label={
                      line.type === "FUEL"
                        ? t("finalReconciliation.editFuelCharge")
                        : t("finalReconciliation.editDamage")
                    }
                    onClick={() => (line.type === "FUEL" ? startEditFuel(line) : startEditDamage(line))}
                  >
                    <Icon name="mdi:pencil-outline" size={16} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconAction} ${styles.iconActionDanger}`}
                    aria-label={
                      line.type === "FUEL"
                        ? t("finalReconciliation.deleteFuelCharge")
                        : t("finalReconciliation.deleteDamage")
                    }
                    disabled={linePending}
                    onClick={() =>
                      line.type === "FUEL" ? onDeleteFuel(line.id) : onDeleteDamage(line.id)
                    }
                  >
                    <Icon name="mdi:delete-outline" size={16} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>{t("finalReconciliation.noReturnCharges")}</p>
      )}

      <Dialog
        open={damageFormOpen && editable}
        onClose={resetDamageForm}
        title={editDamageId ? t("finalReconciliation.editDamage") : t("finalReconciliation.addDamage")}
        closeLabel={t("detail.close")}
        size="default"
      >
        <div className={styles.damageFormFields} data-testid="damage-form">
          <Input
            value={location}
            placeholder={t("finalReconciliation.damageLocation")}
            onChange={(event) => setLocation(event.target.value)}
          />
          <Input
            inputMode="numeric"
            value={amount}
            placeholder={t("finalReconciliation.damageCost")}
            onChange={(event) => setAmount(event.target.value)}
          />
          <div className={styles.damageFormActions}>
            <Button type="button" size="sm" variant="ghost" onClick={resetDamageForm}>
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" loading={linePending} onClick={submitDamage}>
              {editDamageId ? t("finalReconciliation.saveDamage") : t("finalReconciliation.addDamage")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={fuelFormOpen && editable}
        onClose={resetFuelForm}
        title={editFuelId ? t("finalReconciliation.editFuelCharge") : t("finalReconciliation.addFuelCharge")}
        closeLabel={t("detail.close")}
        size="default"
      >
        <div className={styles.damageFormFields} data-testid="fuel-form">
          <Input
            inputMode="numeric"
            value={fuelAmount}
            placeholder={t("finalReconciliation.fuelCost")}
            onChange={(event) => setFuelAmount(event.target.value)}
          />
          <div className={styles.damageFormActions}>
            <Button type="button" size="sm" variant="ghost" onClick={resetFuelForm}>
              {t("common.cancel")}
            </Button>
            <Button type="button" size="sm" loading={linePending} onClick={submitFuel}>
              {editFuelId ? t("finalReconciliation.saveFuelCharge") : t("finalReconciliation.addFuelCharge")}
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

/** @deprecated Use ReconciliationReturnChargesSection */
export const ReconciliationDamagesSection = ReconciliationReturnChargesSection;

function summaryLineKey(key: string): string {
  if (key === "damages") return "DAMAGE";
  if (key === "violations") return "VIOLATION";
  if (key === "salik") return "SALIK";
  return key.toUpperCase();
}

export function ReconciliationFinancialSummary({
  data,
  currency = "AED",
  variant = "full",
}: {
  data: Pick<
    FullReconciliationReadDto,
    "totals" | "reconciliationChargesAmount" | "outstandingRenewalAmount" | "settlementAmountDue"
  >;
  currency?: string;
  variant?: "full" | "compact";
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  const entries = totalsEntries(data.totals);

  const breakdown = (
    <>
      {entries.length > 0 ? (
        <dl className={styles.summaryList}>
          {entries.map((entry) => (
            <div key={entry.key}>
              <dt>{t(`reconcile.type.${summaryLineKey(entry.key)}`)}</dt>
              <dd dir="ltr">
                {format.number(entry.amount)} {currency}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.muted}>{t("finalReconciliation.noCharges")}</p>
      )}
      <dl className={styles.summaryList}>
        <div>
          <dt>{t("finalReconciliation.reconciliationCharges")}</dt>
          <dd dir="ltr">
            {format.number(data.reconciliationChargesAmount)} {currency}
          </dd>
        </div>
        {data.outstandingRenewalAmount > 0 ? (
          <div>
            <dt>{t("finalReconciliation.unpaidRenewalsSubtotal")}</dt>
            <dd dir="ltr">
              {format.number(data.outstandingRenewalAmount)} {currency}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className={variant === "compact" ? styles.finalAmountCompact : styles.finalAmountRow} data-testid="reconciliation-final-amount">
        <span>{t("finalReconciliation.finalAmountDue")}</span>
        <span className={styles.finalAmountValue} dir="ltr">
          {format.number(data.settlementAmountDue)} {currency}
        </span>
      </div>
    </>
  );

  if (variant === "compact") return breakdown;

  return (
    <section id={SECTION_IDS.summary} className={styles.section} data-testid="reconciliation-summary">
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.financialSummary")}</h3>
      {breakdown}
    </section>
  );
}

export function ReconciliationOutstandingRenewalsSection({
  data,
}: {
  data: FullReconciliationReadDto;
}) {
  const t = useTranslations("Contracts");
  const format = useFormatter();
  if (data.outstandingRenewals.length === 0) return null;

  return (
    <section
      className={styles.section}
      data-testid="reconciliation-unpaid-renewals"
    >
      <h3 className={styles.sectionTitle}>{t("finalReconciliation.unpaidRenewalsTitle")}</h3>
      <ul className={styles.renewalOutstandingList}>
        {data.outstandingRenewals.map((row) => (
          <li key={row.id} className={styles.renewalOutstandingItem}>
            <p>
              {format.dateTime(new Date(row.previousEndAt), { dateStyle: "medium" })}
              {" → "}
              {format.dateTime(new Date(row.newEndAt), { dateStyle: "medium" })}
            </p>
            <p className={styles.muted}>
              +{format.number(row.additionalDays)} · {format.number(row.amount)} AED
            </p>
            <p className={styles.muted} data-testid="renewal-auto-included">
              {t("finalReconciliation.autoIncludedInSettlement")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { SECTION_IDS as RECONCILIATION_SECTION_IDS };
