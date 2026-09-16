"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import { IntegrationStatusRow } from "@/shared/components/integration-status-row";
import { SimulationButton, applyTarsSimulation, useDemoSimulation } from "@/modules/demo-simulation";
import { useContractTars } from "../../hooks/use-contract-tars";
import { getTarsSectionView } from "../../utils/tars-status";
import styles from "./contract-tars-status.module.css";

export interface ContractTarsStatusProps {
  contractId: string;
}

/**
 * Read-only TARS integration state for a Contract.
 *
 * Status display only: Diamond actions will drive TARS automatically once the
 * official API exists, so the employee never gets a second thing to remember.
 * No execute, retry or resync control belongs here.
 */
export function ContractTarsStatus({ contractId }: ContractTarsStatusProps) {
  const t = useTranslations("Contracts.tars");
  const format = useFormatter();
  const { tars: realTars, status } = useContractTars(contractId);
  const simulation = useDemoSimulation();
  const preset = simulation.enabled ? simulation.snapshot.tarsPreset : null;
  const tars = applyTarsSimulation(realTars, preset);
  const view = preset ? getTarsSectionView("ready", tars) : getTarsSectionView(status, tars);

  return (
    <section className={styles.section} data-testid="contract-tars">
      <div className={styles.head}>
        <p className={styles.title}>{t("title")}</p>
        <div className={styles.headActions}>
          {simulation.enabled ? <SimulationButton surface="tars" /> : null}
          {view.kind === "ready" ? (
            <Chip tone={view.summary.connection.tone} dot>
              {t(view.summary.connection.translationKey)}
            </Chip>
          ) : null}
        </div>
      </div>

      {view.kind === "loading" ? (
        <div className={styles.skeletonList} aria-hidden="true">
          <span className={styles.skeleton} />
          <span className={styles.skeleton} />
          <span className={styles.skeleton} />
        </div>
      ) : null}

      {view.kind === "error" ? (
        <p className={styles.error} role="status">
          {t("error")}
        </p>
      ) : null}

      {view.kind === "ready" ? (
        <>
          {view.summary.configured ? null : (
            <p className={styles.hint}>{t("notConnectedHint")}</p>
          )}

          {view.summary.externalContractId ? (
            <div className={styles.kv}>
              <span>{t("reference")}</span>
              <bdi className={styles.reference}>{view.summary.externalContractId}</bdi>
            </div>
          ) : null}

          {view.summary.lastSuccessfulSyncAt ? (
            <div className={styles.kv}>
              <span>{t("lastSync")}</span>
              <b>
                {format.dateTime(new Date(view.summary.lastSuccessfulSyncAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </b>
            </div>
          ) : null}

          <div className={styles.rows}>
            {view.summary.rows.map((row) => (
              <IntegrationStatusRow
                key={row.key}
                label={t(`operation.${row.key}`)}
                status={t(`status.${row.presentation.status}`)}
                tone={row.presentation.tone}
                syncing={row.presentation.syncing}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
