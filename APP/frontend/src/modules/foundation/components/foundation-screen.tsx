"use client";

import { useTranslations } from "next-intl";
import { useFoundation } from "../hooks/use-foundation";

export function FoundationScreen() {
  const translate = useTranslations("Foundation");
  const { backendHealth, isLoading, error, checkBackend } = useFoundation();

  return (
    <main>
      <h1>{translate("title")}</h1>
      <p>{translate("description")}</p>
      <p>{translate("architecture")}</p>
      <button
        type="button"
        onClick={() => void checkBackend()}
        disabled={isLoading}
      >
        {isLoading ? translate("checking") : translate("checkBackend")}
      </button>
      {backendHealth ? (
        <p>{translate("backend", { status: backendHealth.status })}</p>
      ) : null}
      {error ? (
        <p role="alert">
          {error.code}: {error.message}
        </p>
      ) : null}
    </main>
  );
}
