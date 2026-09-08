"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { env } from "@/config/env";

export interface ContractInspectionImageProps {
  path: string;
  alt: string;
  className?: string;
}

export function ContractInspectionImage({
  path,
  alt,
  className,
}: ContractInspectionImageProps) {
  const { data: session } = useSession();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function load() {
      const token = session?.accessToken;
      if (!path || !token) {
        setSrc(null);
        return;
      }
      const url = path.startsWith("http") ? path : `${env.apiUrl}${path}`;
      try {
        const response = await fetch(url, {
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

  if (!src) return <div className={className} role="img" aria-label={alt} />;
  return <img src={src} alt={alt} className={className} />; // eslint-disable-line @next/next/no-img-element -- authenticated blob URL
}
