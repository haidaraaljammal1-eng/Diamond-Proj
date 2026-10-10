"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import { Dialog } from "@/shared/components/ui/dialog";
import { Select, type SelectOption } from "@/shared/components/ui/select";
import { useGpsHistory } from "../../hooks/use-gps-history";
import type {
  GpsHistoryPreset,
  GpsPlaybackSpeed,
  GpsVehicleSummaryDto,
} from "../../types/gps.types";
import {
  clampPlaybackIndex,
  customUaeHistoryRange,
  historyDisplayMotion,
  historyPresetRange,
  playbackDelayMs,
  toUaeCalendarParts,
  validateHistoryRange,
} from "../../utils/gps-history";
import { resolveGpsErrorMessage } from "../../utils/resolve-gps-error";
import { GpsHistoryMap } from "./gps-history-map";
import styles from "./gps-history.module.css";

export interface GpsHistoryDialogProps {
  open: boolean;
  vehicle: GpsVehicleSummaryDto | null;
  onClose: () => void;
}

const PRESETS: Exclude<GpsHistoryPreset, "custom">[] = [
  "last1h",
  "last6h",
  "last24h",
];

function createDefaultCustomRange() {
  const now = new Date();
  const from = toUaeCalendarParts(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
  const to = toUaeCalendarParts(now);
  return {
    dates: { from: from.date, to: to.date },
    fromTime: from.time,
    toTime: to.time,
  };
}

export function GpsHistoryDialog({
  open,
  vehicle,
  onClose,
}: GpsHistoryDialogProps) {
  const t = useTranslations("Gps");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();
  const format = useFormatter();
  const gpsHistory = useGpsHistory();
  const resetHistory = gpsHistory.reset;
  const [defaultCustomRange] = useState(createDefaultCustomRange);
  const [preset, setPreset] = useState<GpsHistoryPreset>("last24h");
  const [customDates, setCustomDates] = useState(defaultCustomRange.dates);
  const [fromTime, setFromTime] = useState(defaultCustomRange.fromTime);
  const [toTime, setToTime] = useState(defaultCustomRange.toTime);
  const [validationReason, setValidationReason] = useState<
    "invalid" | "too_large" | "future_only" | null
  >(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<GpsPlaybackSpeed>("1");

  const history = gpsHistory.history;
  const points = history?.points ?? [];
  const activePoint = points[clampPlaybackIndex(activeIndex, points.length)] ?? null;

  useEffect(() => {
    resetHistory();
    return resetHistory;
  }, [resetHistory]);

  useEffect(() => {
    if (!playing || points.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => {
        if (current >= points.length - 1) {
          setPlaying(false);
          return points.length - 1;
        }
        return current + 1;
      });
    }, playbackDelayMs(playbackSpeed));
    return () => window.clearInterval(timer);
  }, [playbackSpeed, playing, points.length]);

  const speedOptions = useMemo<readonly SelectOption<GpsPlaybackSpeed>[]>(
    () =>
      (["1", "2", "4", "8"] as const).map((value) => ({
        value,
        label: t("history.controls.speedValue", { value }),
      })),
    [t],
  );

  const mapLabels = useMemo(
    () => ({
      start: t("history.markers.start"),
      end: t("history.markers.end"),
      active: t("history.markers.active"),
    }),
    [t],
  );

  const dateRangeLabels = useMemo(
    () => ({
      fieldLabel: t("history.customDates"),
      placeholder: tDateRange("placeholder"),
      apply: tDateRange("apply"),
      clear: tDateRange("clear"),
      daysSelected: (count: number) => tDateRange("daysSelected", { count }),
      previousMonth: tDateRange("previousMonth"),
      nextMonth: tDateRange("nextMonth"),
      presets: {
        today: tDateRange("presets.today"),
        last7: tDateRange("presets.last7"),
        last30: tDateRange("presets.last30"),
        thisMonth: tDateRange("presets.thisMonth"),
        lastMonth: tDateRange("presets.lastMonth"),
        custom: tDateRange("presets.custom"),
      },
    }),
    [t, tDateRange],
  );

  async function handleFetch() {
    if (!vehicle) return;
    const range =
      preset === "custom"
        ? customUaeHistoryRange(
            customDates.from,
            fromTime,
            customDates.to,
            toTime,
          )
        : historyPresetRange(preset);
    if (!range) {
      setValidationReason("invalid");
      return;
    }
    const validation = validateHistoryRange(range);
    if (!validation.valid) {
      setValidationReason(validation.reason);
      return;
    }
    setValidationReason(null);
    setActiveIndex(0);
    setPlaying(false);
    await gpsHistory.fetchHistory(vehicle.id, range);
  }

  const totalDistance = history
    ? history.summary.totalDistanceMeters >= 1_000
      ? t("history.units.kilometers", {
          value: format.number(history.summary.totalDistanceMeters / 1_000, {
            maximumFractionDigits: 2,
          }),
        })
      : t("history.units.meters", {
          value: format.number(history.summary.totalDistanceMeters, {
            maximumFractionDigits: 0,
          }),
        })
    : "—";
  const durationHours = history ? Math.floor(history.summary.durationSeconds / 3_600) : 0;
  const durationMinutes = history
    ? Math.floor((history.summary.durationSeconds % 3_600) / 60)
    : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("history.title")}
      description={
        vehicle
          ? t("history.description", { vehicle: vehicle.displayName })
          : t("history.descriptionFallback")
      }
      closeLabel={t("history.close")}
      size="wide"
    >
      <div className={styles.body} data-testid="gps-history-dialog">
        <div className={styles.toolbar}>
          <div className={styles.presets} role="group" aria-label={t("history.range")}>
            {PRESETS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={preset === value ? "primary" : "secondary"}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {t(`history.presets.${value}`)}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={preset === "custom" ? "primary" : "secondary"}
              aria-pressed={preset === "custom"}
              onClick={() => setPreset("custom")}
            >
              {t("history.presets.custom")}
            </Button>
          </div>

          {preset === "custom" ? (
            <div className={styles.custom} data-testid="gps-history-custom-range">
              <DateRangePicker
                value={customDates}
                locale={locale}
                labels={dateRangeLabels}
                onApply={setCustomDates}
                onClear={() => setCustomDates({ from: "", to: "" })}
                disabled={gpsHistory.isLoading}
              />
              <label className={styles.timeField}>
                <span>{t("history.fromTime")}</span>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={fromTime}
                  onChange={(event) => setFromTime(event.target.value)}
                  disabled={gpsHistory.isLoading}
                />
              </label>
              <label className={styles.timeField}>
                <span>{t("history.toTime")}</span>
                <input
                  className={styles.timeInput}
                  type="time"
                  value={toTime}
                  onChange={(event) => setToTime(event.target.value)}
                  disabled={gpsHistory.isLoading}
                />
              </label>
            </div>
          ) : null}

          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={gpsHistory.isLoading}
            disabled={!vehicle || gpsHistory.isLoading}
            onClick={() => void handleFetch()}
            data-testid="gps-history-fetch"
          >
            {t("history.fetch")}
          </Button>
          <p className={styles.timezone}>{t("history.timezone")}</p>
        </div>

        {validationReason ? (
          <p className={styles.validation} role="alert">
            {t(`history.validation.${validationReason}`)}
          </p>
        ) : null}
        {gpsHistory.error ? (
          <p className={styles.error} role="alert">
            {resolveGpsErrorMessage(t, gpsHistory.error)}
          </p>
        ) : null}
        {gpsHistory.isLoading ? (
          <p className={styles.loading} role="status">
            {t("history.loading")}
          </p>
        ) : null}

        {history ? (
          <>
            <div className={styles.summary} data-testid="gps-history-summary">
              <Card padding="compact" className={styles.metric}>
                <span>{t("history.summary.distance")}</span>
                <strong>{totalDistance}</strong>
              </Card>
              <Card padding="compact" className={styles.metric}>
                <span>{t("history.summary.maxSpeed")}</span>
                <strong>
                  {history.summary.maxSpeedKph == null
                    ? "—"
                    : t("history.units.speed", {
                        value: format.number(history.summary.maxSpeedKph, {
                          maximumFractionDigits: 0,
                        }),
                      })}
                </strong>
              </Card>
              <Card padding="compact" className={styles.metric}>
                <span>{t("history.summary.points")}</span>
                <strong>{format.number(history.summary.pointCount)}</strong>
              </Card>
              <Card padding="compact" className={styles.metric}>
                <span>{t("history.summary.duration")}</span>
                <strong>
                  {t("history.units.duration", {
                    hours: durationHours,
                    minutes: durationMinutes,
                  })}
                </strong>
              </Card>
              <div className={styles.range}>
                <span>
                  {t("history.summary.from")}:{" "}
                  {format.dateTime(new Date(history.from), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
                <span>
                  {t("history.summary.to")}:{" "}
                  {format.dateTime(new Date(history.to), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </div>
            </div>

            {points.length > 0 ? (
              <div className={styles.workspace}>
                <div className={styles.mapWrap}>
                  <GpsHistoryMap
                    points={points}
                    activeIndex={activeIndex}
                    labels={mapLabels}
                  />
                </div>
                <aside className={styles.playbackPanel}>
                  <div className={styles.controls}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (activeIndex >= points.length - 1) setActiveIndex(0);
                        setPlaying((value) => !value);
                      }}
                    >
                      {playing
                        ? t("history.controls.pause")
                        : t("history.controls.play")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setActiveIndex(0);
                        setPlaying(true);
                      }}
                    >
                      {t("history.controls.restart")}
                    </Button>
                    <label className={styles.speedField}>
                      <span>{t("history.controls.speed")}</span>
                      <Select
                        options={speedOptions}
                        value={playbackSpeed}
                        onChange={setPlaybackSpeed}
                        variant="ghost"
                        size="sm"
                        aria-label={t("history.controls.speed")}
                      />
                    </label>
                  </div>
                  <input
                    className={styles.slider}
                    type="range"
                    min={0}
                    max={Math.max(0, points.length - 1)}
                    value={clampPlaybackIndex(activeIndex, points.length)}
                    onChange={(event) => {
                      setPlaying(false);
                      setActiveIndex(Number(event.target.value));
                    }}
                    aria-label={t("history.controls.timeline")}
                    data-testid="gps-history-scrubber"
                  />
                  <p className={styles.position}>
                    {t("history.controls.position", {
                      current: clampPlaybackIndex(activeIndex, points.length) + 1,
                      total: points.length,
                    })}
                  </p>

                  {activePoint ? (
                    <dl className={styles.readout} data-testid="gps-history-readout">
                      <div>
                        <dt>{t("history.point.time")}</dt>
                        <dd>
                          {format.dateTime(new Date(activePoint.capturedAt), {
                            dateStyle: "medium",
                            timeStyle: "medium",
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("history.point.speed")}</dt>
                        <dd>
                          {activePoint.speedKph == null
                            ? "—"
                            : t("history.units.speed", {
                                value: format.number(activePoint.speedKph, {
                                  maximumFractionDigits: 0,
                                }),
                              })}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("history.point.motion")}</dt>
                        <dd>
                          {t(
                            `history.motion.${historyDisplayMotion(activePoint.speedKph)}`,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("history.point.segmentDistance")}</dt>
                        <dd>
                          {activePoint.segmentDistanceMeters == null
                            ? "—"
                            : t("history.units.meters", {
                                value: format.number(
                                  activePoint.segmentDistanceMeters,
                                  { maximumFractionDigits: 0 },
                                ),
                              })}
                        </dd>
                      </div>
                      {activePoint.addressLine ? (
                        <div>
                          <dt>{t("history.point.address")}</dt>
                          <dd>{activePoint.addressLine}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </aside>
              </div>
            ) : (
              <p className={styles.empty} data-testid="gps-history-empty">
                {t("history.empty")}
              </p>
            )}
          </>
        ) : !gpsHistory.isLoading && !gpsHistory.error ? (
          <p className={styles.empty}>{t("history.prompt")}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
