"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DamageMark, DamageMarkType } from "@/modules/public-rental/types/official-contract.types";
import { toggleDamageMark, type DiagramView } from "@/modules/public-rental/utils/official-contract-damage-zones";
import { FUEL_LEVELS } from "@/modules/public-rental/utils/official-contract-document";
import { CONTRACT_CUSTODY } from "@/modules/public-rental/utils/official-contract-template";
import {
  DamageOverlay,
  DamageToolbar,
  FuelBar,
} from "@/modules/public-rental/components/official-contract-a4/contract-paper-widgets";
import { SignaturePad } from "@/modules/public-rental/components/official-contract-a4/signature-pad";
import { EndView, SideView, TopView } from "@/modules/public-rental/components/official-contract-a4/vehicle-condition-diagrams";
import paper from "@/modules/public-rental/components/official-contract-a4/official-contract-a4.module.css";
import type { FuelLevel } from "../../types/contract.types";
import styles from "./vehicle-condition-sheet.module.css";

export interface VehicleConditionSheetProps {
  side: "OUT" | "IN";
  damage: DamageMark[];
  fuel: FuelLevel | null;
  onDamage: (marks: DamageMark[]) => void;
  onFuel: (level: FuelLevel) => void;
  onSignature: (image: Blob | null) => void;
  signatureImageUrl?: string | null;
  editable?: boolean;
}

const SIDE_VIEWS: Array<{ view: DiagramView; label: keyof typeof CONTRACT_CUSTODY.views; art: () => ReactNode }> = [
  { view: "LEFT", label: "left", art: SideView },
  { view: "RIGHT", label: "right", art: SideView },
  { view: "FRONT_REAR", label: "frontRear", art: EndView },
];

/** `.paper` width (97mm, one A4 custody column) in CSS px. */
const PAPER_WIDTH_PX = (97 * 96) / 25.4;

const FUEL_TEXT:Partial<Record<FuelLevel, string>> = { F: "Full", E: "Empty" };

/**
 * Staff-side paper block of the official contract for one custody event:
 * damage marks on the vehicle diagrams, fuel gauge and the hirer's signature.
 * Same artwork and zones as the A4 agreement, so marks land on the contract as drawn.
 */
export function VehicleConditionSheet({ side, damage, fuel, onDamage, onFuel, onSignature, signatureImageUrl = null, editable = true }: VehicleConditionSheetProps) {
  const [tool, setTool] = useState<DamageMarkType>("SCRATCH");
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // The paper is drawn in mm; zoom it to the dialog width (SignaturePad ink is zoom-safe).
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      if (frame.clientWidth > 0) setScale(frame.clientWidth / PAPER_WIDTH_PX);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const copy = side === "OUT" ? CONTRACT_CUSTODY.out : CONTRACT_CUSTODY.in;
  const toggle = (zone: string) => onDamage(toggleDamageMark(damage, zone, tool));
  const steps = FUEL_LEVELS.length - 1;
  const fill = fuel === null ? null : (steps - FUEL_LEVELS.indexOf(fuel)) / steps;

  return (
    <div ref={frameRef} className={styles.frame} dir="ltr" data-testid={`vehicle-condition-${side.toLowerCase()}`}>
      <div className={`${paper.sheet} ${styles.paper}`} style={{ zoom: scale }}>
        <div className={styles.tag}>{copy.tag}</div>
        <div className={paper.diagset} data-editable>
          <div className={paper.dv}>
            <span className={paper.dvl}>{CONTRACT_CUSTODY.views.top}</span>
            <TopView />
            <DamageOverlay view="TOP" marks={damage} editable={editable} onToggle={toggle} />
          </div>
          <div className={paper.dvrow}>
            {SIDE_VIEWS.map(({ view, label, art: Art }) => (
              <div key={view} className={paper.dv}>
                <span className={paper.dvl}>{CONTRACT_CUSTODY.views[label]}</span>
                <Art />
                <DamageOverlay view={view} marks={damage} editable={editable} onToggle={toggle} />
              </div>
            ))}
          </div>
        </div>
        {editable ? <DamageToolbar active={tool} onSelect={setTool} onClearAll={() => onDamage([])} /> : null}
        <FuelBar label={copy.fuel} fill={fill} text={fuel === null ? "" : (FUEL_TEXT[fuel] ?? fuel)} onSelect={editable ? onFuel : undefined} />
        <div className={paper.vsig}>
          <span className={paper.en}>{CONTRACT_CUSTODY.signatureEn}</span>
          <SignaturePad
            slotLabel={`${copy.tag} — ${CONTRACT_CUSTODY.signatureEn}`}
            imageUrl={signatureImageUrl}
            drawn={false}
            editable={editable}
            required={false}
            compact
            onDraw={onSignature}
            onClear={() => onSignature(null)}
          />
          <span className={paper.ar} dir="rtl">{CONTRACT_CUSTODY.signatureAr}</span>
        </div>
      </div>
    </div>
  );
}
