"use client";

/* eslint-disable @next/next/no-img-element -- token-scoped signature image */
import { useEffect, useRef, useState, type PointerEvent } from "react";
import styles from "./official-contract-a4.module.css";

interface SignaturePadProps {
  slotLabel: string;
  /** Saved signature image (token-scoped URL) when one exists and no local change is pending. */
  imageUrl: string | null;
  /** A local drawing exists (pending save). */
  drawn: boolean;
  editable: boolean;
  required: boolean;
  compact?: boolean;
  onDraw: (image: Blob) => void;
  onClear: () => void;
}

/**
 * Paper signature box that accepts pointer/touch ink. Exports PNG after each
 * stroke. The drawing stays in memory; saving is done by the review store.
 */
export function SignaturePad({
  slotLabel,
  imageUrl,
  drawn,
  editable,
  required,
  compact = false,
  onDraw,
  onClear,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  /** Ink kept as vector strokes in normalized (0..1) coordinates, so any resize can redraw it exactly. */
  const strokes = useRef<Array<Array<{ x: number; y: number }>>>([]);
  const [hasInk, setHasInk] = useState(drawn);

  const redraw = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = canvas.width / Math.max(canvas.clientWidth, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 1.8 * ratio;
    ctx.strokeStyle = "#10214a";
    ctx.fillStyle = "#10214a";
    for (const stroke of strokes.current) {
      const [first, ...rest] = stroke;
      if (!first) continue;
      ctx.beginPath();
      if (rest.length === 0) {
        ctx.arc(first.x * canvas.width, first.y * canvas.height, 0.9 * ratio, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const p of rest) ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = canvas;
      if (!clientWidth || !clientHeight) return;
      const width = Math.round(clientWidth * ratio);
      const height = Math.round(clientHeight * ratio);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      redraw(canvas);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // Normalized to the visual box, so CSS zoom and resizes never distort the ink.
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push([point(event)]);
    redraw(event.currentTarget);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    strokes.current.at(-1)?.push(point(event));
    redraw(event.currentTarget);
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    setHasInk(true);
    event.currentTarget.toBlob((blob) => {
      if (blob) onDraw(blob);
    }, "image/png");
  };

  const clear = () => {
    strokes.current = [];
    if (canvasRef.current) redraw(canvasRef.current);
    setHasInk(false);
    onClear();
  };

  const showImage = Boolean(imageUrl) && !hasInk;

  return (
    <div className={styles.padWrap}>
      <div
        className={`${compact ? styles.vsigbox : styles.sigbox} ${editable ? styles.padEditable : ""}`}
        data-required={required || undefined}
        data-signed={showImage || hasInk || undefined}
      >
        {showImage ? <img className={styles.sigImage} src={imageUrl!} alt={slotLabel} /> : null}
        <canvas
          ref={canvasRef}
          className={styles.sigCanvas}
          aria-label={slotLabel}
          role="img"
          hidden={showImage}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {editable && !showImage && !hasInk ? <span className={styles.sigHint}>وقّع هنا · Sign here</span> : null}
      </div>
      {editable && (showImage || hasInk) ? (
        <button type="button" className={styles.clr} onClick={clear}>
          مسح · Clear
        </button>
      ) : null}
    </div>
  );
}
