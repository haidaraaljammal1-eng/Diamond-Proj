"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { usePermissions } from "@/modules/auth";
import {
  linkWhatsAppCustomer,
  searchDiamondCustomers,
  unlinkWhatsAppCustomer,
} from "../../api/whatsapp.api";
import { whatsappCustomerMatch } from "../../utils/whatsapp-customer-match";
import { whatsappCustomerContext } from "../../utils/whatsapp-customer-context";
import type {
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppCustomerMatchDto,
  WhatsAppLinkedCustomerDto,
} from "../../types/whatsapp.types";
import {
  CUSTOMERS_READ_PERMISSION,
  WHATSAPP_LINK_CUSTOMER_PERMISSION,
} from "../../whatsapp.permissions";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import styles from "./customer-strip.module.css";

export function WhatsAppCustomerControls({
  conversation,
  layout = "strip",
}: {
  conversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto;
  layout?: "strip" | "header";
}) {
  const t = useTranslations("WhatsApp");
  const { hasPermission } = usePermissions();
  const inbox = useWhatsApp();
  const canLink = hasPermission(WHATSAPP_LINK_CUSTOMER_PERMISSION);
  const canReadCustomers = hasPermission(CUSTOMERS_READ_PERMISSION);
  const detail = "customerLink" in conversation ? conversation : null;
  const matchKey = detail ? `${conversation.id}:${detail.customerLink.linked ? "linked" : "open"}` : "";
  const [match, setMatch] = useState<WhatsAppCustomerMatchDto | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<WhatsAppLinkedCustomerDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmLinkId, setConfirmLinkId] = useState<number | null>(null);

  useEffect(() => {
    if (!matchKey || matchKey.endsWith(":linked")) {
      setMatch(null);
      return;
    }
    if (inbox.simulationActive) {
      if (conversation.id.endsWith("harbor")) {
        setMatch({
          state: "ONE_MATCH",
          customer: {
            id: 301,
            name: "Demo Harbor Match",
            mobile: "15550001002",
            externalId: "C-301",
          },
        });
        return;
      }
      if (conversation.id.endsWith("unknown")) {
        setMatch({ state: "AMBIGUOUS", customer: null });
        return;
      }
      setMatch({ state: "NO_MATCH", customer: null });
      return;
    }
    let cancelled = false;
    void whatsappCustomerMatch
      .load(conversation.id)
      .then((next) => {
        if (!cancelled) setMatch(next);
      })
      .catch(() => {
        if (!cancelled) setMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [matchKey, conversation.id, inbox.simulationActive, inbox.customerMatchRevision]);

  async function link(customerId: number) {
    try {
      if (inbox.simulationActive) {
        inbox.simulationLinkCustomer?.(customerId);
        setOpen(false);
        return;
      }
      await linkWhatsAppCustomer(conversation.id, customerId);
      whatsappCustomerMatch.invalidate(conversation.id);
      whatsappCustomerContext.invalidate(conversation.id);
      inbox.selectConversation(conversation.id);
      setOpen(false);
      setConfirmLinkId(null);
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    }
  }

  async function unlink() {
    try {
      if (inbox.simulationActive) {
        inbox.simulationUnlinkCustomer?.();
        return;
      }
      await unlinkWhatsAppCustomer(conversation.id);
      whatsappCustomerMatch.invalidate(conversation.id);
      whatsappCustomerContext.invalidate(conversation.id);
      inbox.selectConversation(conversation.id);
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    }
  }

  const linked = detail?.customerLink.linked;
  const customer = detail?.customerLink.customer;

  const rootClass = layout === "header" ? styles.headerControls : styles.strip;

  return (
    <div
      className={rootClass}
      data-testid={layout === "header" ? "whatsapp-customer-header" : "whatsapp-customer-strip"}
    >
      {linked ? (
        <>
          <p className={styles.label}>{t("customer.linked")}</p>
          <p className={styles.name}>{customer?.name || t("customer.linkedHidden")}</p>
          {customer?.mobile ? <p className={styles.meta}>{customer.mobile}</p> : null}
          {canLink ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void unlink()}>
              {t("customer.unlink")}
            </Button>
          ) : null}
        </>
      ) : (
        <>
          {match?.state === "ONE_MATCH" && match.customer ? (
            <>
              <p className={styles.label}>
                {t("customer.possibleMatch")}: {match.customer.name}
              </p>
              {canLink ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="whatsapp-link-suggested-customer"
                  onClick={() => setConfirmLinkId(match.customer!.id)}
                >
                  {t("customer.linkSuggested", { name: match.customer.name })}
                </Button>
              ) : null}
            </>
          ) : match?.state === "ONE_MATCH" ? (
            <p className={styles.label}>{t("customer.possibleMatch")}</p>
          ) : match?.state === "AMBIGUOUS" ? (
            <p className={styles.label}>{t("customer.ambiguous")}</p>
          ) : match?.state === "NO_SAFE_MATCH" ? (
            <p className={styles.label}>{t("customer.noSafeMatch")}</p>
          ) : (
            <p className={styles.label}>{t("customer.none")}</p>
          )}
          {canLink ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="whatsapp-link-customer"
              onClick={() => setOpen(true)}
            >
              {t("customer.link")}
            </Button>
          ) : null}
        </>
      )}
      {error ? <p className={styles.error}>{error}</p> : null}
      <Dialog
        open={confirmLinkId != null}
        onClose={() => setConfirmLinkId(null)}
        title={t("customer.linkConfirmTitle")}
        closeLabel={t("templates.close")}
      >
        <p>{t("customer.linkConfirmBody")}</p>
        <div className={styles.confirmActions}>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmLinkId(null)}>
            {t("media.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => confirmLinkId != null && void link(confirmLinkId)}
          >
            {t("customer.link")}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("customer.link")}
        closeLabel={t("templates.close")}
      >
        {canReadCustomers ? (
          <>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("customer.search")}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void searchDiamondCustomers(search).then(setResults).catch(() => setResults([]));
              }}
            >
              {t("search.button")}
            </Button>
            <ul className={styles.results}>
              {results.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void link(row.id)}>
                    {row.name}
                    {row.mobile ? ` · ${row.mobile}` : ""}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>{t("customer.needCustomerRead")}</p>
        )}
      </Dialog>
    </div>
  );
}
