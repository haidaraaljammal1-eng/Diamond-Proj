"use client";

import type { KeyboardEvent } from "react";
import type { DamageMark, DamageMarkType } from "../../types/official-contract.types";
import {
  DAMAGE_MARK_LABELS,
  DAMAGE_MARK_TYPES,
  DAMAGE_ZONE_MAP,
  zoneCenter,
  type DiagramView,
} from "../../utils/official-contract-damage-zones";
import { FUEL_LEVELS } from "../../utils/official-contract-document";

type FuelLevel = (typeof FUEL_LEVELS)[number];
import styles from "./official-contract-a4.module.css";

const VIEW_BOX: Record<DiagramView, string> = {
  TOP: "0 0 340 170",
  LEFT: "0 0 210 84",
  RIGHT: "0 0 210 84",
  FRONT_REAR: "0 0 130 84",
};

const GLYPH_SIZE: Record<DiagramView, number> = { TOP: 11, LEFT: 7.5, RIGHT: 7.5, FRONT_REAR: 7.5 };

function MarkGlyph({ type, x, y, s }: { type: DamageMarkType; x: number; y: number; s: number }) {
  const common = { className: styles.mark, fill: "none" } as const;
  switch (type) {
    case "SCRATCH":
      return <path {...common} d={`M${x - s} ${y - s}L${x + s} ${y + s}M${x + s} ${y - s}L${x - s} ${y + s}`} />;
    case "DENT":
      return <circle {...common} cx={x} cy={y} r={s} />;
    case "BROKEN":
      return <path {...common} d={`M${x} ${y - s}L${x + s} ${y + s * 0.8}L${x - s} ${y + s * 0.8}Z`} />;
    case "MISSING":
      return <rect {...common} x={x - s} y={y - s} width={s * 2} height={s * 2} />;
  }
}

/** Transparent tap zones + red paper marks laid over one demo diagram. */
export function DamageOverlay({
  view,
  marks,
  editable,
  onToggle,
}: {
  view: DiagramView;
  marks: readonly DamageMark[];
  editable: boolean;
  onToggle: (zone: string) => void;
}) {
  const zones = DAMAGE_ZONE_MAP[view];
  const byZone = new Map(marks.map((m) => [m.zone, m.type]));
  return (
    <svg className={styles.overlay} viewBox={VIEW_BOX[view]} preserveAspectRatio="xMidYMid meet" aria-hidden={!editable}>
      {editable
        ? zones.map((zone) => {
            const props = {
              className: styles.zone,
              role: "button",
              tabIndex: 0,
              "aria-label": zone.id,
              "aria-pressed": byZone.has(zone.id),
              "data-zone": zone.id,
              onClick: () => onToggle(zone.id),
              onKeyDown: (event: KeyboardEvent) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onToggle(zone.id);
                }
              },
            };
            return zone.shape.kind === "rect" ? (
              <rect key={zone.id} {...props} x={zone.shape.x} y={zone.shape.y} width={zone.shape.w} height={zone.shape.h} />
            ) : (
              <circle key={zone.id} {...props} cx={zone.shape.cx} cy={zone.shape.cy} r={zone.shape.r} />
            );
          })
        : null}
      {zones.map((zone) => {
        const type = byZone.get(zone.id);
        if (!type) return null;
        const { x, y } = zoneCenter(zone.shape);
        return <MarkGlyph key={`m-${zone.id}`} type={type} x={x} y={y} s={GLYPH_SIZE[view]} />;
      })}
    </svg>
  );
}

/** Demo damage toolbar (تعليم الضرر). Hidden in print. */
export function DamageToolbar({
  active,
  onSelect,
  onClearAll,
}: {
  active: DamageMarkType;
  onSelect: (type: DamageMarkType) => void;
  onClearAll: () => void;
}) {
  return (
    <div className={styles.dmgbar} dir="rtl">
      <span className={styles.dl}>تعليم الضرر:</span>
      {DAMAGE_MARK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={styles.dbtn}
          data-on={active === type || undefined}
          aria-pressed={active === type}
          onClick={() => onSelect(type)}
        >
          {DAMAGE_MARK_LABELS[type].glyph} {DAMAGE_MARK_LABELS[type].ar}
        </button>
      ))}
      <button type="button" className={`${styles.dbtn} ${styles.dact}`} onClick={onClearAll}>
        مسح الكل
      </button>
    </div>
  );
}

/**
 * Horizontal fuel level bar (8 segments, E → F). With `onSelect` it becomes a
 * gauge input: a segment sets that many eighths, "E" sets empty.
 */
export function FuelBar({
  label,
  fill,
  text,
  onSelect,
}: {
  label: string;
  fill: number | null;
  text: string;
  onSelect?: (level: FuelLevel) => void;
}) {
  const segments = FUEL_LEVELS.length - 1;
  const filled = fill === null ? 0 : Math.round(fill * segments);
  if (onSelect) {
    const level = (count: number) => FUEL_LEVELS[segments - count]!;
    return (
      <div className={styles.fuelBar} role="radiogroup" aria-label={label} data-editable>
        <span className={styles.fuelLbl}>{label}</span>
        <button
          type="button"
          className={`${styles.fuelEnd} ${styles.fuelPick}`}
          role="radio"
          aria-checked={fill === 0}
          aria-label={`${label}: E`}
          onClick={() => onSelect("E")}
        >
          E
        </button>
        <span className={styles.fuelTrack}>
          {Array.from({ length: segments }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.fuelSeg} ${styles.fuelPick}`}
              data-on={i < filled || undefined}
              role="radio"
              aria-checked={filled === i + 1}
              aria-label={`${label}: ${level(i + 1)}`}
              onClick={() => onSelect(level(i + 1))}
            />
          ))}
        </span>
        <span className={styles.fuelEnd}>F</span>
        <span className={styles.fuelText} dir="ltr">{text}</span>
      </div>
    );
  }
  return (
    <div className={styles.fuelBar} role="img" aria-label={`${label}: ${text || "—"}`}>
      <span className={styles.fuelLbl}>{label}</span>
      <span className={styles.fuelEnd}>E</span>
      <span className={styles.fuelTrack}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={styles.fuelSeg} data-on={i < filled || undefined} />
        ))}
      </span>
      <span className={styles.fuelEnd}>F</span>
      <span className={styles.fuelText} dir="ltr">{text}</span>
    </div>
  );
}

/** Paper card-number boxes are display-only; Stripe Elements owns actual card entry. */
export function CardNumberBoxes({ boxes }: { boxes: string[] }) {
  return (
    <div className={styles.ccgrid} dir="ltr" role="img" aria-label="Masked card number">
      {boxes.map((value, index) => (
        <span key={index} className={styles.ccbox} data-group-end={(index + 1) % 4 === 0 || undefined}>
          {value}
        </span>
      ))}
    </div>
  );
}
