import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CreateArchiveRowSchema,
  UpdateArchiveRowSchema,
} from "src/modules/archive/archive.schema";
import { toArchiveRow } from "src/modules/archive/archive.mapper";

test("CreateArchiveRowSchema accepts empty body (all manual fields optional)", () => {
  const parsed = CreateArchiveRowSchema.parse({});
  assert.deepEqual(parsed, {});
});

test("CreateArchiveRowSchema rejects invalid mileage", () => {
  assert.throws(() => CreateArchiveRowSchema.parse({ kmIn: -1 }));
  assert.throws(() => CreateArchiveRowSchema.parse({ kmIn: 1.5 }));
});

test("CreateArchiveRowSchema rejects invalid money", () => {
  assert.throws(() => CreateArchiveRowSchema.parse({ salik: -5 }));
});

test("CreateArchiveRowSchema preserves customerPhone as string", () => {
  const parsed = CreateArchiveRowSchema.parse({ customerPhone: "+971 050 1234567" });
  assert.equal(parsed.customerPhone, "+971 050 1234567");
});

test("CreateArchiveRowSchema validates HH:mm times", () => {
  assert.equal(CreateArchiveRowSchema.parse({ deliveryTime: "09:30" }).deliveryTime, "09:30");
  assert.throws(() => CreateArchiveRowSchema.parse({ deliveryTime: "25:00" }));
  assert.throws(() => CreateArchiveRowSchema.parse({ deliveryTime: "9:30" }));
});

test("UpdateArchiveRowSchema requires at least one field", () => {
  assert.throws(() => UpdateArchiveRowSchema.parse({}));
});

test("UpdateArchiveRowSchema allows clearing nullable fields", () => {
  const parsed = UpdateArchiveRowSchema.parse({ customerName: null, salik: null });
  assert.equal(parsed.customerName, null);
  assert.equal(parsed.salik, null);
});

test("UpdateArchiveRowSchema rejects immutable keys", () => {
  assert.throws(() => UpdateArchiveRowSchema.parse({ rowOrder: 99 }));
  assert.throws(() => UpdateArchiveRowSchema.parse({ vehicleId: 99 }));
  assert.throws(() => UpdateArchiveRowSchema.parse({ id: 1, customerName: "x" }));
  assert.throws(() => UpdateArchiveRowSchema.parse({ createdAt: new Date() }));
});

test("toArchiveRow maps Prisma row without transformation", () => {
  const now = new Date("2026-01-15T10:00:00.000Z");
  const dto = toArchiveRow({
    id: 7,
    vehicleId: 3,
    rowOrder: 2,
    kmIn: null,
    km: 12000,
    kmOut: null,
    deliveryDate: null,
    deliveryTime: null,
    returnDate: null,
    returnTime: null,
    customerName: null,
    customerPhone: "+971501234567",
    description: null,
    days: null,
    dailyRate: null,
    rentalTotal: null,
    salik: 150,
    parking: null,
    fuel: null,
    blackPoints: null,
    fines: null,
    total: null,
    dollar: null,
    cash: null,
    visa: null,
    transfer: null,
    remaining: null,
    createdAt: now,
    updatedAt: now,
  });
  assert.equal(dto.km, 12000);
  assert.equal(dto.customerPhone, "+971501234567");
  assert.equal(dto.salik, 150);
  assert.equal(dto.kmIn, null);
});
