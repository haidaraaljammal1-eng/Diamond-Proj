import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addExpenseFormSchema,
  correctExpenseFormSchema,
  voidExpenseFormSchema,
} from "./add-expense.schema.ts";

const validAdd = {
  amount: "80",
  category: "VEHICLE_CLEANING",
  recognizedAt: "2026-09-11T10:00",
  description: "Vehicle cleaning",
};

const RELATIVE_KEYS = ["required", "wholeAed", "positiveAmount", "tooLong"] as const;

function issueFor(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  field: string,
): string | undefined {
  if (result.success || !result.error) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

function allMessages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  if (result.success || !result.error) return [];
  return result.error.issues.map((issue) => issue.message);
}

function assertRelative(message: string | undefined): void {
  assert.ok(message, "expected a validation message");
  assert.equal(message.startsWith("validation."), false, message);
  assert.ok(
    (RELATIVE_KEYS as readonly string[]).includes(message),
    `unexpected key ${message}`,
  );
}

async function resolverMessage(
  schema: typeof addExpenseFormSchema | typeof correctExpenseFormSchema | typeof voidExpenseFormSchema,
  values: Record<string, unknown>,
  field: string,
): Promise<string | undefined> {
  const resolver = zodResolver(schema);
  const result = await resolver(values as never, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
  const error = (result.errors as Record<string, { message?: string } | undefined>)[field];
  return error?.message;
}

function walkTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkTsFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".test.ts")) return [];
    return [full];
  });
}

describe("finance expense validation keys", () => {
  it("uses relative FormError keys, not validation.* prefixes", () => {
    const result = addExpenseFormSchema.safeParse({
      ...validAdd,
      amount: "",
      description: "",
    });
    for (const message of allMessages(result)) {
      assertRelative(message);
    }
  });

  it("rejects empty, zero, negative, and decimal amounts with the correct keys", () => {
    assert.equal(issueFor(addExpenseFormSchema.safeParse({ ...validAdd, amount: "" }), "amount"), "required");
    assert.equal(issueFor(addExpenseFormSchema.safeParse({ ...validAdd, amount: "0" }), "amount"), "positiveAmount");
    assert.equal(issueFor(addExpenseFormSchema.safeParse({ ...validAdd, amount: "-5" }), "amount"), "wholeAed");
    assert.equal(issueFor(addExpenseFormSchema.safeParse({ ...validAdd, amount: "80.5" }), "amount"), "wholeAed");
  });

  it("accepts a whole AED amount of 80", () => {
    const result = addExpenseFormSchema.safeParse(validAdd);
    assert.equal(result.success, true);
  });

  it("requires description, category, and date", () => {
    assert.equal(
      issueFor(addExpenseFormSchema.safeParse({ ...validAdd, description: "" }), "description"),
      "required",
    );
    assert.equal(
      issueFor(addExpenseFormSchema.safeParse({ ...validAdd, category: "" }), "category"),
      "required",
    );
    assert.equal(
      issueFor(addExpenseFormSchema.safeParse({ ...validAdd, recognizedAt: "" }), "recognizedAt"),
      "required",
    );
  });

  it("rejects overlong optional text with tooLong", () => {
    assert.equal(
      issueFor(
        addExpenseFormSchema.safeParse({ ...validAdd, description: "x".repeat(501) }),
        "description",
      ),
      "tooLong",
    );
    assert.equal(
      issueFor(
        addExpenseFormSchema.safeParse({ ...validAdd, vendorName: "x".repeat(201) }),
        "vendorName",
      ),
      "tooLong",
    );
    assert.equal(
      issueFor(
        addExpenseFormSchema.safeParse({ ...validAdd, receiptNumber: "x".repeat(101) }),
        "receiptNumber",
      ),
      "tooLong",
    );
    assert.equal(
      issueFor(addExpenseFormSchema.safeParse({ ...validAdd, note: "x".repeat(1001) }), "note"),
      "tooLong",
    );
  });

  it("requires a void reason on standalone Void only", () => {
    assert.equal(
      issueFor(voidExpenseFormSchema.safeParse({ voidReason: "" }), "voidReason"),
      "required",
    );
    assert.equal(
      issueFor(voidExpenseFormSchema.safeParse({ voidReason: "x".repeat(501) }), "voidReason"),
      "tooLong",
    );
    const correct = correctExpenseFormSchema.safeParse(validAdd);
    assert.equal(correct.success, true);
    assert.equal("voidReason" in (correct.success ? correct.data : {}), false);
    assert.equal("voidReason" in correctExpenseFormSchema.shape, false);
  });

  it("zodResolver emits the same relative keys FormError expects", async () => {
    assert.equal(await resolverMessage(addExpenseFormSchema, { ...validAdd, amount: "" }, "amount"), "required");
    assert.equal(
      await resolverMessage(addExpenseFormSchema, { ...validAdd, amount: "80.5" }, "amount"),
      "wholeAed",
    );
    assert.equal(await resolverMessage(correctExpenseFormSchema, { ...validAdd }, "voidReason"), undefined);
    assert.equal(await resolverMessage(voidExpenseFormSchema, { voidReason: "" }, "voidReason"), "required");
    assert.equal(
      await resolverMessage(voidExpenseFormSchema, { voidReason: "x".repeat(501) }, "voidReason"),
      "tooLong",
    );
  });

  it("correct dialog has no Void Reason field", () => {
    const dialog = readFileSync(
      path.join(import.meta.dirname, "../correct-expense/correct-expense-dialog.tsx"),
      "utf8",
    );
    assert.equal(dialog.includes("voidReason"), false);
    assert.equal(dialog.includes("correctionAuditReason"), false);
    assert.equal(dialog.includes("toCorrectManualExpensePayload"), true);
  });

  it("finance module sources never pass validation.* prefixed FormError messages", () => {
    const financeRoot = path.join(import.meta.dirname, "../..");
    const pattern = /["']validation\.(required|wholeAed|positiveAmount|tooLong)/;
    for (const file of walkTsFiles(financeRoot)) {
      const text = readFileSync(file, "utf8");
      const match = text.match(pattern);
      assert.equal(match, null, `${path.relative(financeRoot, file)} contains ${match?.[0]}`);
    }
  });
});
