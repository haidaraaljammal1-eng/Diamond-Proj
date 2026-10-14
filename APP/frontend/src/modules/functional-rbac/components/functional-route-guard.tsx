"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { isFunctionalRbacV2UiEnabled } from "../feature-flag";
import { resolveFunctionalPageIdFromPath } from "../route-map";
import type { FunctionalPageId } from "../types";
import { useDiamondPageAccess } from "../hooks/use-diamond-access";
import { shouldShowFunctionalRouteGuardLoading } from "./functional-route-guard.session-loading";
import styles from "./functional-route-guard.module.css";

const LOCALE_PATTERN = /^\/(ar|en)(?=\/|$)/;

export function FunctionalRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status, data: session } = useSession();
  const t = useTranslations("FunctionalRbac");
  const hasUser = Boolean(session?.user);
  const showBootstrapLoading = shouldShowFunctionalRouteGuardLoading(status, hasUser);

  if (!isFunctionalRbacV2UiEnabled()) {
    return children;
  }

  const currentPath = pathname.replace(LOCALE_PATTERN, "") || "/";
  const pageId = resolveFunctionalPageIdFromPath(currentPath);
  if (!pageId) {
    return children;
  }

  if (showBootstrapLoading) {
    return (
      <div
        className={styles.panel}
        role="status"
        aria-live="polite"
        data-functional-route-guard="session-bootstrap"
      >
        {t("routeGuard.loading")}
      </div>
    );
  }

  return (
    <GuardedPage pageId={pageId} sessionStatus={status}>
      {children}
    </GuardedPage>
  );
}

function GuardedPage({
  pageId,
  sessionStatus,
  children,
}: {
  pageId: FunctionalPageId;
  sessionStatus: string;
  children: ReactNode;
}) {
  const t = useTranslations("FunctionalRbac");
  const allowed = useDiamondPageAccess(pageId);

  if (sessionStatus === "unauthenticated" || !allowed) {
    return (
      <section
        className={styles.panel}
        role="status"
        data-functional-route-guard="denied"
      >
        <p className={styles.title}>{t("routeGuard.deniedTitle")}</p>
        <p className={styles.text}>{t("routeGuard.deniedDescription")}</p>
      </section>
    );
  }

  return (
    <div data-functional-route-guard="active">{children}</div>
  );
}
