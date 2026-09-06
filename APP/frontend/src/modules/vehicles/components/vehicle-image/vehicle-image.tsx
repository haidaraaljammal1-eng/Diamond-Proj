"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { resolveVehicleMediaUrl } from "../../utils/vehicle-image-url";

export interface VehicleImageProps {
  path: string | null | undefined;
  alt: string;
  className?: string;
}

/**
 * Loads vehicle photos through the authenticated backend stream endpoint.
 * Falls back to an empty presentation when no image is available.
 */
export function VehicleImage({ path, alt, className }: VehicleImageProps) {
  const { data: session } = useSession();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function load() {
      if (!path) {
        setSrc(null);
        return;
      }
      const token = session?.accessToken;
      if (!token) {
        setSrc(null);
        return;
      }
      try {
        const response = await fetch(resolveVehicleMediaUrl(path), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          if (active) setSrc(null);
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
      } catch {
        if (active) setSrc(null);
      }
    }

    void load();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, session?.accessToken]);

  if (!src) {
    return <div className={className} role="img" aria-label={alt} data-empty="true" />;
  }

  return <img src={src} alt={alt} className={className} loading="lazy" />; // eslint-disable-line @next/next/no-img-element -- authenticated blob URL from backend stream
}
