import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import type { ContractTarsStateDto, TarsOperationStatus } from "../types/tars.types.ts";
import {
  TARS_OPERATION_ORDER,
  buildTarsSummary,
  getTarsConnectionPresentation,
  getTarsSectionView,
  getTarsStatusPresentation,
} from "./tars-status.ts";

const MESSAGES_DIR = path.join(import.meta.dirname, "../../../../messages");

function readMessages(locale: "ar" | "en"): Record<string, never> {
  return JSON.parse(
    readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"),
  ) as Record<string, never>;
}

function tarsMessages(locale: "ar" | "en"): Record<string, never> {
  const messages = readMessages(locale) as unknown as {
    Contracts: { tars: Record<string, never> };
  };
  return messages.Contracts.tars;
}

function stateWith(
  overrides: Partial<ContractTarsStateDto> = {},
  status: TarsOperationStatus = "NOT_STARTED",
): ContractTarsStateDto {
  return {
    configured: false,
    externalContractId: null,
    lastSuccessfulSyncAt: null,
    operations: {
      registerContract: status,
      contractAcceptance: status,
      handover: status,
      returnDocumentation: status,
      completeContract: status,
    },
    ...overrides,
  };
}

describe("TARS operation order", () => {
  it("lists exactly the five approved mandatory procedures, in workflow order", () => {
    assert.deepEqual(TARS_OPERATION_ORDER, [
      "registerContract",
      "contractAcceptance",
      "handover",
      "returnDocumentation",
      "completeContract",
    ]);
  });
});

describe("getTarsConnectionPresentation", () => {
  it("shows an unconfigured provider as neutral, not as a failure", () => {
    assert.deepEqual(getTarsConnectionPresentation(false), {
      translationKey: "notConnected",
      tone: "neutral",
    });
  });

  it("shows a configured provider as connected", () => {
    assert.deepEqual(getTarsConnectionPresentation(true), {
      translationKey: "connected",
      tone: "ok",
    });
  });
});

describe("getTarsStatusPresentation", () => {
  it("maps NOT_STARTED to a neutral marker", () => {
    assert.deepEqual(getTarsStatusPresentation("NOT_STARTED"), {
      status: "NOT_STARTED",
      tone: "neutral",
      syncing: false,
    });
  });

  it("maps PENDING to the warm amber marker", () => {
    assert.deepEqual(getTarsStatusPresentation("PENDING"), {
      status: "PENDING",
      tone: "warn",
      syncing: false,
    });
  });

  it("maps PROCESSING to the gold marker with the subtle sync animation", () => {
    assert.deepEqual(getTarsStatusPresentation("PROCESSING"), {
      status: "PROCESSING",
      tone: "gold",
      syncing: true,
    });
  });

  it("maps SUCCEEDED to the positive marker", () => {
    assert.deepEqual(getTarsStatusPresentation("SUCCEEDED"), {
      status: "SUCCEEDED",
      tone: "ok",
      syncing: false,
    });
  });

  it("maps FAILED to the soft red marker", () => {
    assert.deepEqual(getTarsStatusPresentation("FAILED"), {
      status: "FAILED",
      tone: "bad",
      syncing: false,
    });
  });

  it("falls back to NOT_STARTED for an unknown or missing status", () => {
    assert.equal(getTarsStatusPresentation(undefined).status, "NOT_STARTED");
    assert.equal(getTarsStatusPresentation("SOMETHING_NEW").status, "NOT_STARTED");
  });
});

describe("buildTarsSummary", () => {
  it("renders the unconfigured contract as five NOT_STARTED rows", () => {
    const summary = buildTarsSummary(stateWith());

    assert.equal(summary.configured, false);
    assert.equal(summary.connection.translationKey, "notConnected");
    assert.equal(summary.rows.length, 5);
    assert.ok(summary.rows.every((row) => row.presentation.status === "NOT_STARTED"));
    assert.equal(summary.externalContractId, null);
    assert.equal(summary.lastSuccessfulSyncAt, null);
  });

  it("keeps each operation on its own status", () => {
    const summary = buildTarsSummary(
      stateWith({
        configured: true,
        operations: {
          registerContract: "SUCCEEDED",
          contractAcceptance: "PROCESSING",
          handover: "PENDING",
          returnDocumentation: "FAILED",
          completeContract: "NOT_STARTED",
        },
      }),
    );

    assert.deepEqual(
      summary.rows.map((row) => [row.key, row.presentation.status]),
      [
        ["registerContract", "SUCCEEDED"],
        ["contractAcceptance", "PROCESSING"],
        ["handover", "PENDING"],
        ["returnDocumentation", "FAILED"],
        ["completeContract", "NOT_STARTED"],
      ],
    );
    assert.equal(summary.connection.translationKey, "connected");
  });

  it("exposes the external TARS reference and last successful sync when present", () => {
    const summary = buildTarsSummary(
      stateWith({
        configured: true,
        externalContractId: "TARS-2026-000411",
        lastSuccessfulSyncAt: "2026-09-09T09:30:00.000Z",
      }),
    );

    assert.equal(summary.externalContractId, "TARS-2026-000411");
    assert.equal(summary.lastSuccessfulSyncAt, "2026-09-09T09:30:00.000Z");
    assert.ok(!Number.isNaN(new Date(summary.lastSuccessfulSyncAt!).getTime()));
  });
});

describe("getTarsSectionView", () => {
  it("shows the skeleton while the projection is still loading", () => {
    assert.deepEqual(getTarsSectionView("loading", null), { kind: "loading" });
    assert.deepEqual(getTarsSectionView("idle", null), { kind: "loading" });
  });

  it("contains a failed integration read inside the TARS section", () => {
    // The Contract Drawer keeps rendering: this view is the whole blast radius.
    assert.deepEqual(getTarsSectionView("error", null), { kind: "error" });
  });

  it("renders the summary once the projection arrives", () => {
    const view = getTarsSectionView("ready", stateWith());
    assert.equal(view.kind, "ready");
  });
});

describe("TARS translations", () => {
  const REQUIRED_STATUSES: TarsOperationStatus[] = [
    "NOT_STARTED",
    "PENDING",
    "PROCESSING",
    "SUCCEEDED",
    "FAILED",
  ];

  for (const locale of ["ar", "en"] as const) {
    it(`${locale}.json covers every TARS label`, () => {
      const tars = tarsMessages(locale) as unknown as {
        title: string;
        connected: string;
        notConnected: string;
        notConnectedHint: string;
        reference: string;
        lastSync: string;
        error: string;
        operation: Record<string, string>;
        status: Record<string, string>;
        inline: Record<string, string>;
      };

      for (const key of [
        "title",
        "connected",
        "notConnected",
        "notConnectedHint",
        "reference",
        "lastSync",
        "error",
      ] as const) {
        assert.equal(typeof tars[key], "string", `${locale}: missing ${key}`);
        assert.ok(tars[key].length > 0, `${locale}: empty ${key}`);
      }

      for (const key of TARS_OPERATION_ORDER)
        assert.ok(tars.operation[key], `${locale}: missing operation.${key}`);
      for (const status of REQUIRED_STATUSES)
        assert.ok(tars.status[status], `${locale}: missing status.${status}`);
      for (const key of ["handover", "returnDocumentation", "completeContract"] as const)
        assert.ok(tars.inline[key], `${locale}: missing inline.${key}`);
    });
  }

  it("uses the approved Arabic wording", () => {
    const tars = tarsMessages("ar") as unknown as {
      title: string;
      notConnected: string;
      notConnectedHint: string;
      operation: Record<string, string>;
      status: Record<string, string>;
    };

    assert.equal(tars.title, "حالة الربط مع TARS");
    assert.equal(tars.notConnected, "غير متصل حالياً");
    assert.equal(tars.notConnectedHint, "سيتم تفعيل المزامنة عند ربط واجهة TARS الرسمية.");
    assert.equal(tars.operation.registerContract, "تسجيل العقد");
    assert.equal(tars.operation.handover, "تسليم المركبة");
    assert.equal(tars.status.PROCESSING, "جارٍ المزامنة");
    assert.equal(tars.status.FAILED, "فشل الربط");
  });

  it("uses the approved English wording", () => {
    const tars = tarsMessages("en") as unknown as {
      title: string;
      notConnected: string;
      notConnectedHint: string;
      operation: Record<string, string>;
      status: Record<string, string>;
    };

    assert.equal(tars.title, "TARS Integration Status");
    assert.equal(tars.notConnected, "Not Connected");
    assert.equal(
      tars.notConnectedHint,
      "Synchronization will be enabled once the official TARS API is configured.",
    );
    assert.equal(tars.operation.returnDocumentation, "Vehicle Return");
    assert.equal(tars.operation.completeContract, "Contract Completion");
    assert.equal(tars.status.PROCESSING, "Syncing");
    assert.equal(tars.status.SUCCEEDED, "Synced");
  });
});

describe("TARS UI has no execution surface", () => {
  const COMPONENTS_DIR = path.join(
    import.meta.dirname,
    "../components/contract-tars",
  );

  /** Comments discuss what is deliberately absent; only code is asserted on. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  const sources = [
    "contract-tars-status.tsx",
    "contract-tars-inline-status.tsx",
  ].map((file) => stripComments(readFileSync(path.join(COMPONENTS_DIR, file), "utf8")));

  it("renders no button, no click handler and no execute call", () => {
    for (const source of sources) {
      assert.ok(!/<button/i.test(source), "TARS UI must not render a button");
      assert.ok(!/onClick/.test(source), "TARS UI must not bind a click handler");
      assert.ok(
        !/\b(retry|resync|execute|submit|syncNow)\b/i.test(source),
        "TARS UI must not offer an execution action",
      );
    }
  });

  it("reads the projection endpoint only", () => {
    const api = readFileSync(
      path.join(import.meta.dirname, "../api/tars.api.ts"),
      "utf8",
    );
    assert.ok(api.includes("/tars"));
    assert.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(api));
  });
});
