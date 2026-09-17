"use client";

/* eslint-disable @next/next/no-img-element -- print-faithful static contract logo */
import { useState, type ReactNode } from "react";
import type {
  DamageMark,
  DamageMarkType,
  OfficialContractEdits,
  OfficialContractMode,
  OfficialContractReviewField,
  OfficialContractView,
  OfficialSignatureSlot,
} from "../../types/official-contract.types";
import { toggleDamageMark, type DiagramView } from "../../utils/official-contract-damage-zones";
import {
  buildOfficialContractDocument,
  type ContractFieldModel,
  type CustodyModel,
  type SignatureModel,
} from "../../utils/official-contract-document";
import {
  CONTRACT_ACKNOWLEDGEMENT,
  CONTRACT_AGREEMENT_LABEL,
  CONTRACT_CARD_AUTHORIZATION,
  CONTRACT_CUSTODY,
  CONTRACT_HEADER,
  CONTRACT_MILEAGE_TERMS,
  CONTRACT_SIGNATURES,
  CONTRACT_TERMS,
  CONTRACT_TITLE,
} from "../../utils/official-contract-template";
import { CardNumberBoxes, DamageOverlay, DamageToolbar, FuelBar } from "./contract-paper-widgets";
import { SignaturePad } from "./signature-pad";
import { EndView, SideView, TopView } from "./vehicle-condition-diagrams";
import styles from "./official-contract-a4.module.css";

interface OfficialContractA4Props {
  contract: OfficialContractView;
  mode: OfficialContractMode;
  edits?: OfficialContractEdits;
  cardDigits?: string | null;
  damageOut?: DamageMark[];
  pendingSignatures?: Partial<Record<OfficialSignatureSlot, "DRAWN" | "CLEAR">>;
  invalidFields?: readonly string[];
  /** Image URL for a stored signature (the page shell knows the token). */
  signatureImageUrl?: (slot: OfficialSignatureSlot) => string | null;
  onEdit?: (field: OfficialContractReviewField, value: string) => void;
  onCardDigits?: (digits: string) => void;
  onDamageOut?: (marks: DamageMark[]) => void;
  onSignature?: (slot: OfficialSignatureSlot, image: Blob | null) => void;
}

const DIAGRAMS: Array<{ view: DiagramView; label: keyof typeof CONTRACT_CUSTODY.views; art: ReactNode }> = [
  { view: "TOP", label: "top", art: <TopView /> },
  { view: "LEFT", label: "left", art: <SideView /> },
  { view: "RIGHT", label: "right", art: <SideView /> },
  { view: "FRONT_REAR", label: "frontRear", art: <EndView /> },
];

/**
 * The official Diamond rental agreement on one A4 portrait sheet (210 × 297 mm).
 * Presentational: no data loading and no knowledge of where identity came
 * from. Interactive paper elements (editable cells, damage marks, card boxes,
 * signature pads) are active only in REVIEW mode when the Backend allows them.
 */
export function OfficialContractA4({
  contract,
  mode,
  edits,
  cardDigits,
  damageOut,
  pendingSignatures,
  invalidFields = [],
  signatureImageUrl,
  onEdit,
  onCardDigits,
  onDamageOut,
  onSignature,
}: OfficialContractA4Props) {
  const doc = buildOfficialContractDocument(contract, {
    mode,
    edits,
    cardDigits,
    damageOut,
    pendingSignatures,
  });
  const [tool, setTool] = useState<DamageMarkType>("SCRATCH");

  const renderField = (field: ContractFieldModel, stacked: boolean) => {
    const invalid = field.editableField ? invalidFields.includes(field.editableField) : false;
    return (
      <div key={field.path} className={`${styles.fld} ${stacked ? styles.stacked : ""}`}>
        <span className={styles.lEn} dir="ltr">{field.en}</span>
        {field.editableField && onEdit ? (
          <textarea
            className={styles.fi}
            rows={1}
            data-size={field.size}
            data-field={field.editableField}
            data-invalid={invalid || undefined}
            aria-invalid={invalid || undefined}
            aria-label={`${field.en} / ${field.ar}`}
            dir={field.dir}
            value={field.value}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            onChange={(event) => onEdit(field.editableField!, event.target.value.replace(/\n/g, " "))}
          />
        ) : (
          <span className={styles.val} data-size={field.size} dir={field.dir} data-path={field.path}>
            {field.value}
          </span>
        )}
        <span className={styles.lAr} dir="rtl">{field.ar}</span>
      </div>
    );
  };

  const signaturePad = (signature: SignatureModel, label: string, compact = false) => (
    <SignaturePad
      key={`${signature.slot}-${signature.hasImage}`}
      slotLabel={label}
      imageUrl={signature.hasImage ? (signatureImageUrl?.(signature.slot) ?? null) : null}
      drawn={pendingSignatures?.[signature.slot] === "DRAWN"}
      editable={signature.editable && Boolean(onSignature)}
      required={signature.required}
      compact={compact}
      onDraw={(image) => onSignature?.(signature.slot, image)}
      onClear={() => onSignature?.(signature.slot, null)}
    />
  );

  const custody = (side: "out" | "in", block: CustodyModel) => {
    const copy = CONTRACT_CUSTODY[side];
    const editable = side === "out" && block.damageEditable && Boolean(onDamageOut);
    const toggle = (zone: string) => onDamageOut?.(toggleDamageMark(block.damage, zone, tool));
    const signature = side === "out" ? doc.signatures.vehicleOutHirer : doc.signatures.vehicleInHirer;
    return (
      <div className={styles.vcol} data-testid={`vehicle-${side}`}>
        <div className={styles.vhead}>
          <div className={styles.vhM}>
            <span className={styles.ar} dir="rtl">{CONTRACT_CUSTODY.mileageAr}</span>
            <span className={styles.en}>{copy.mileageEn}</span>
            <span className={styles.vhVal} dir="ltr">{block.mileage}</span>
          </div>
          <div className={styles.vhTag}>{copy.tag}</div>
        </div>
        <div className={styles.diagset} data-editable={editable || undefined}>
          <div className={styles.dv}>
            <span className={styles.dvl}>{CONTRACT_CUSTODY.views.top}</span>
            {DIAGRAMS[0]!.art}
            <DamageOverlay view="TOP" marks={block.damage} editable={editable} onToggle={toggle} />
          </div>
          <div className={styles.dvrow}>
            {DIAGRAMS.slice(1).map((diagram) => (
              <div key={diagram.view} className={styles.dv}>
                <span className={styles.dvl}>{CONTRACT_CUSTODY.views[diagram.label]}</span>
                {diagram.art}
                <DamageOverlay view={diagram.view} marks={block.damage} editable={editable} onToggle={toggle} />
              </div>
            ))}
          </div>
        </div>
        {editable ? (
          <DamageToolbar active={tool} onSelect={setTool} onClearAll={() => onDamageOut?.([])} />
        ) : null}
        <FuelBar label={copy.fuel} fill={block.fuelFill} text={block.fuelLabel} />
        <div className={styles.vsig}>
          <span className={styles.en}>{CONTRACT_CUSTODY.signatureEn}</span>
          {signaturePad(signature, `${copy.tag} — ${CONTRACT_CUSTODY.signatureEn}`, true)}
          <span className={styles.ar} dir="rtl">{CONTRACT_CUSTODY.signatureAr}</span>
        </div>
      </div>
    );
  };

  return (
    <article
      className={styles.sheet}
      dir="ltr"
      lang="en"
      data-mode={mode}
      data-testid="official-contract-a4"
      aria-label="Rental Agreement / عقد إيجار"
    >
      <header className={styles.hdr}>
        <img className={styles.logo} src={CONTRACT_HEADER.logoSrc} alt={CONTRACT_HEADER.logoAlt} />
        <div className={styles.hdrCo}>
          <span className={styles.coAr} dir="rtl" lang="ar">{CONTRACT_HEADER.companyAr}</span>
          <span className={styles.coEn}>{CONTRACT_HEADER.companyEn}</span>
          <span className={styles.coL}>{CONTRACT_HEADER.mobile}</span>
          <span className={styles.coL}>
            {CONTRACT_HEADER.emailLabel} <span dir="ltr">{CONTRACT_HEADER.email}</span>
          </span>
          <span className={styles.coL}>{CONTRACT_HEADER.location}</span>
        </div>
      </header>

      <div className={styles.agr}>
        <span className={styles.agrLbl}>{CONTRACT_AGREEMENT_LABEL}</span>
        <span className={styles.agrNo} data-testid="agreement-number">{doc.agreementNumber}</span>
      </div>

      <div className={styles.ctitle}>
        <div className={styles.ctEn}>
          {CONTRACT_TITLE.en[0]}
          <br />
          {CONTRACT_TITLE.en[1]}
        </div>
        <div className={styles.ctAr} dir="rtl" lang="ar">
          {CONTRACT_TITLE.ar[0]}
          <br />
          {CONTRACT_TITLE.ar[1]}
        </div>
      </div>

      <div className={styles.tbl} role="table">
        {doc.grid.map((row, rowIndex) => (
          <div key={rowIndex} className={styles.trow} role="row">
            {row.map((cell, cellIndex) => (
              <div
                key={cellIndex}
                role="cell"
                className={styles.cell}
                style={cell.span > 1 ? { gridColumn: `span ${cell.span}` } : undefined}
              >
                {cell.fields.map((field) => renderField(field, cell.fields.length > 1))}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.terms} data-testid="mileage-terms">
        <p className={styles.kmEn}>
          {CONTRACT_MILEAGE_TERMS.before}
          <span className={styles.blank} data-path="rental.includedKmPerDay">{doc.mileageTerms.includedKmPerDay}</span>
          {CONTRACT_MILEAGE_TERMS.middle} {CONTRACT_MILEAGE_TERMS.secondBefore}
          <span className={styles.blank} data-path="rental.extraKmRate">{doc.mileageTerms.extraKmRate}</span>
          {CONTRACT_MILEAGE_TERMS.after}
        </p>
      </div>

      <div className={styles.vrow}>
        {custody("out", doc.vehicleOut)}
        {custody("in", doc.vehicleIn)}
      </div>

      <div className={styles.lower}>
        <div className={styles.lcol}>
          <div className={styles.ccHead}>
            <span className={styles.en}>{CONTRACT_CARD_AUTHORIZATION.headingEn}</span>
            <span className={styles.ar} dir="rtl">{CONTRACT_CARD_AUTHORIZATION.headingAr}</span>
          </div>
          <p className={styles.ccEn}>{CONTRACT_CARD_AUTHORIZATION.en}</p>
          <p className={styles.ccAr} dir="rtl" lang="ar">
            {CONTRACT_CARD_AUTHORIZATION.ar.map((line) => (
              <span key={line} className={styles.line}>{line}</span>
            ))}
          </p>
          <div data-invalid={invalidFields.includes("cardNumberLast4") || undefined} className={styles.ccWrap}>
            <CardNumberBoxes
              boxes={doc.card.boxes}
              editable={doc.card.editable && Boolean(onCardDigits)}
              onChange={(digits) => onCardDigits?.(digits)}
            />
          </div>
        </div>
        <div className={`${styles.lcol} ${styles.termsCol}`} data-testid="legal-terms">
          {CONTRACT_TERMS.map((term, index) => (
            <div key={index} className={styles.tline}>
              <div className={`${styles.tEn} ${term.continuation ? styles.cont : ""}`}>
                {term.blank ? (
                  <>
                    (<span className={styles.blank} />
                  </>
                ) : null}
                {term.en.split("\n").map((line, i) => (
                  <span key={i} className={i > 0 ? styles.ind : styles.line}>{line}</span>
                ))}
              </div>
              <div className={styles.tAr} dir="rtl" lang="ar">{term.ar}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.ack}>
        <p className={styles.ackAr} dir="rtl" lang="ar">{CONTRACT_ACKNOWLEDGEMENT.ar}</p>
        <p className={styles.ackEn}>{CONTRACT_ACKNOWLEDGEMENT.en}</p>
      </div>

      <div className={styles.sigrow} data-testid="signatures">
        {CONTRACT_SIGNATURES.map((copy) => {
          const signature = doc.signatures[copy.id];
          return (
            <div key={copy.id} className={styles.sigcell}>
              <div className={styles.caption}>
                <span className={styles.capEn}>
                  {copy.en}
                  {signature.required && mode === "REVIEW" ? <span className={styles.req}> *</span> : null}
                </span>
                <span className={styles.capAr} dir="rtl">{copy.ar}</span>
              </div>
              {signaturePad(signature, `${copy.en} / ${copy.ar}`)}
            </div>
          );
        })}
      </div>
    </article>
  );
}
