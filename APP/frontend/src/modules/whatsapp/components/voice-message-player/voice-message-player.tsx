"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { formatAudioClock } from "../../utils/whatsapp-audio-time";
import styles from "./voice-message-player.module.css";

type PlaybackPhase = "loading" | "ready" | "playing" | "paused" | "ended" | "error";

export function WhatsAppVoiceMessagePlayer({
  src,
  testId = "whatsapp-voice-player",
}: {
  src: string;
  testId?: string;
}) {
  const t = useTranslations("WhatsApp");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<PlaybackPhase>("loading");
  const [duration, setDuration] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);

  const syncTime = useCallback(() => {
    const node = audioRef.current;
    if (!node) return;
    setCurrent(node.currentTime);
    if (Number.isFinite(node.duration) && node.duration > 0) {
      setDuration(node.duration);
    }
  }, []);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;

    const onLoaded = () => {
      if (Number.isFinite(node.duration) && node.duration > 0) {
        setDuration(node.duration);
        setPhase("ready");
      } else {
        setPhase("ready");
      }
      syncTime();
    };
    const onPlay = () => setPhase("playing");
    const onPause = () => {
      setPhase(node.ended ? "ended" : "paused");
      syncTime();
    };
    const onEnded = () => {
      setPhase("ended");
      syncTime();
    };
    const onError = () => setPhase("error");
    const onTimeUpdate = () => syncTime();

    node.addEventListener("loadedmetadata", onLoaded);
    node.addEventListener("durationchange", onLoaded);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    node.addEventListener("ended", onEnded);
    node.addEventListener("error", onError);
    node.addEventListener("timeupdate", onTimeUpdate);

    if (node.readyState >= 1) onLoaded();

    return () => {
      node.removeEventListener("loadedmetadata", onLoaded);
      node.removeEventListener("durationchange", onLoaded);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("ended", onEnded);
      node.removeEventListener("error", onError);
      node.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [src, syncTime]);

  const progress = duration && duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const canControl = phase !== "loading" && phase !== "error";

  async function togglePlay() {
    const node = audioRef.current;
    if (!node || !canControl) return;
    if (phase === "playing") {
      node.pause();
      return;
    }
    if (phase === "ended") {
      node.currentTime = 0;
    }
    try {
      await node.play();
    } catch {
      setPhase("error");
    }
  }

  function onSeek(value: number) {
    const node = audioRef.current;
    if (!node || !duration || duration <= 0) return;
    const next = (value / 100) * duration;
    node.currentTime = next;
    setCurrent(next);
  }

  const playLabel =
    phase === "playing" ? t("media.pauseVoice") : t("media.playVoice");
  const statusText =
    phase === "loading"
      ? t("message.mediaLoading")
      : phase === "error"
        ? t("message.mediaFailed")
        : null;

  return (
    <div className={styles.root} data-testid={testId} data-phase={phase}>
      <audio ref={audioRef} src={src} preload="metadata" className={styles.hiddenAudio} />
      <button
        type="button"
        className={styles.play}
        aria-label={playLabel}
        disabled={!canControl}
        onClick={() => void togglePlay()}
      >
        <Icon name={phase === "playing" ? "mdi:pause" : "mdi:play"} size={18} />
      </button>
      <div className={styles.track}>
        <div className={styles.wave}>
          <div className={styles.fill} style={{ width: `${progress}%` }} />
          <input
            type="range"
            className={styles.seek}
            min={0}
            max={100}
            step={0.1}
            value={progress}
            disabled={!canControl || !duration}
            aria-label={t("media.seekVoice")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </div>
        <div className={styles.times}>
          <span>{formatAudioClock(current)}</span>
          <span>{formatAudioClock(duration)}</span>
        </div>
        {statusText ? (
          <span className={phase === "error" ? styles.error : styles.status}>{statusText}</span>
        ) : null}
      </div>
    </div>
  );
}
