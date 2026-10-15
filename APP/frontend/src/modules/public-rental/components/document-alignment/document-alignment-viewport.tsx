"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type TouchEvent,
  type WheelEvent,
} from "react";
import {
  clampRotation,
  computeBaseFitScale,
  computeGuideSize,
  documentAlignmentProfile,
} from "./document-alignment-profiles";
import type {
  DocumentAlignmentKind,
  DocumentAlignmentTransform,
  ViewportSize,
} from "./document-alignment.types";
import {
  clampImageAdjustmentPercent,
  imageAdjustmentCssFilter,
  IMAGE_ADJUSTMENT_BUTTON_STEP,
  IMAGE_ADJUSTMENT_MAX_PERCENT,
  IMAGE_ADJUSTMENT_MIN_PERCENT,
  stepImageAdjustment,
  ZOOM_BUTTON_STEP,
  ZOOM_WHEEL_STEP,
} from "./alignment-image-controls";
import styles from "./document-alignment.module.css";

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 4;
const ROTATION_STEP = 0.5;

interface DocumentAlignmentViewportProps {
  kind: DocumentAlignmentKind;
  previewUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  transform: DocumentAlignmentTransform;
  onTransformChange: (next: DocumentAlignmentTransform) => void;
  onViewportSize: (size: ViewportSize) => void;
}

export function DocumentAlignmentViewport({
  kind,
  previewUrl,
  sourceWidth,
  sourceHeight,
  transform,
  onTransformChange,
  onViewportSize,
}: DocumentAlignmentViewportProps) {
  const profile = documentAlignmentProfile(kind);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 640, height: 400 });

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const size = { width: Math.max(280, rect.width), height: Math.max(220, rect.height) };
      setViewport(size);
      onViewportSize(size);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [onViewportSize]);

  const baseFit = computeBaseFitScale(viewport, { width: sourceWidth, height: sourceHeight });
  const displayScale = baseFit * transform.zoom;
  const guide = computeGuideSize(viewport, profile.guideAspect);
  const displayW = sourceWidth * displayScale;
  const displayH = sourceHeight * displayScale;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: transform.panX,
      panY: transform.panY,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onTransformChange({
      ...transform,
      panX: drag.panX + (event.clientX - drag.x),
      panY: drag.panY + (event.clientY - drag.y),
    });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, transform.zoom + delta));
    onTransformChange({ ...transform, zoom });
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchRef.current = { distance, zoom: transform.zoom };
    }
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const ratio = distance / Math.max(pinchRef.current.distance, 1);
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pinchRef.current.zoom * ratio));
    onTransformChange({ ...transform, zoom });
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  return (
    <div
      ref={shellRef}
      className={styles.viewportShell}
      data-testid="document-alignment-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.viewportStage} style={{ width: viewport.width, height: viewport.height }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview */}
        <img
          src={previewUrl}
          alt=""
          className={styles.sourceImage}
          draggable={false}
          style={{
            width: displayW,
            height: displayH,
            filter: imageAdjustmentCssFilter(transform.brightnessPercent, transform.contrastPercent),
            transform: `translate(calc(-50% + ${transform.panX}px), calc(-50% + ${transform.panY}px)) rotate(${transform.rotationDeg}deg)`,
          }}
        />
        <div
          className={styles.guideFrame}
          style={{ width: guide.width, height: guide.height }}
          aria-hidden="true"
        />
        <div className={styles.guideShade} aria-hidden="true" />
      </div>
    </div>
  );
}

export function useAlignmentControls(
  kind: DocumentAlignmentKind,
  transform: DocumentAlignmentTransform,
  onTransformChange: (next: DocumentAlignmentTransform) => void,
) {
  const profile = documentAlignmentProfile(kind);

  const zoomIn = useCallback(() => {
    onTransformChange({
      ...transform,
      zoom: Math.min(ZOOM_MAX, transform.zoom + ZOOM_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  const zoomOut = useCallback(() => {
    onTransformChange({
      ...transform,
      zoom: Math.max(ZOOM_MIN, transform.zoom - ZOOM_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  const setZoom = useCallback(
    (zoom: number) => {
      onTransformChange({
        ...transform,
        zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
      });
    },
    [onTransformChange, transform],
  );

  const rotateLeft = useCallback(() => {
    onTransformChange({
      ...transform,
      rotationDeg: clampRotation(transform.rotationDeg - ROTATION_STEP, profile),
    });
  }, [onTransformChange, profile, transform]);

  const rotateRight = useCallback(() => {
    onTransformChange({
      ...transform,
      rotationDeg: clampRotation(transform.rotationDeg + ROTATION_STEP, profile),
    });
  }, [onTransformChange, profile, transform]);

  return { zoomIn, zoomOut, setZoom, rotateLeft, rotateRight, ZOOM_MIN, ZOOM_MAX };
}

export function useImageAdjustmentControls(
  transform: DocumentAlignmentTransform,
  onTransformChange: (next: DocumentAlignmentTransform) => void,
) {
  const setBrightness = useCallback(
    (brightnessPercent: number) => {
      onTransformChange({
        ...transform,
        brightnessPercent: clampImageAdjustmentPercent(brightnessPercent),
      });
    },
    [onTransformChange, transform],
  );

  const setContrast = useCallback(
    (contrastPercent: number) => {
      onTransformChange({
        ...transform,
        contrastPercent: clampImageAdjustmentPercent(contrastPercent),
      });
    },
    [onTransformChange, transform],
  );

  const brightnessDown = useCallback(() => {
    onTransformChange({
      ...transform,
      brightnessPercent: stepImageAdjustment(transform.brightnessPercent, -IMAGE_ADJUSTMENT_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  const brightnessUp = useCallback(() => {
    onTransformChange({
      ...transform,
      brightnessPercent: stepImageAdjustment(transform.brightnessPercent, IMAGE_ADJUSTMENT_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  const contrastDown = useCallback(() => {
    onTransformChange({
      ...transform,
      contrastPercent: stepImageAdjustment(transform.contrastPercent, -IMAGE_ADJUSTMENT_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  const contrastUp = useCallback(() => {
    onTransformChange({
      ...transform,
      contrastPercent: stepImageAdjustment(transform.contrastPercent, IMAGE_ADJUSTMENT_BUTTON_STEP),
    });
  }, [onTransformChange, transform]);

  return {
    setBrightness,
    setContrast,
    brightnessDown,
    brightnessUp,
    contrastDown,
    contrastUp,
    ADJUSTMENT_MIN: IMAGE_ADJUSTMENT_MIN_PERCENT,
    ADJUSTMENT_MAX: IMAGE_ADJUSTMENT_MAX_PERCENT,
  };
}
