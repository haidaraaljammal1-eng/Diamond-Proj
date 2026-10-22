import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OfficialContractView } from "../../public-rental/types/official-contract.types";
import type { ContractDetailDto } from "../types/contract.types";
import { hasPostSigningRecords, liveContractView } from "./live-contract-view.ts";

const custody = { status: "NOT_AVAILABLE", occurredAt: null, mileage: null, fuel: null, inspectionAngles: [], damage: [], signatureStatus: "NOT_SIGNED" } as const;
const unsigned = { status: "NOT_SIGNED", signedAt: null, hasImage: false, required: false } as const;

function signedView(): OfficialContractView {
  return {
    header: {
      officeDisplayName: "Diamond Rent Car",
      company: {
        code: "UNIQUE",
        displayName: "UNIQUE",
        legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
        legalNameEn: "Diamond Unique Car Rental CO.L.L.C.S.O.C",
        accentColor: "#C9A15C",
      },
    },
    contract: { agreementNumber: "DE-1", status: "SIGNED", templateVersion: "1", termsVersion: "1" },
    vehicleOut: { ...custody, damage: [] },
    vehicleIn: { ...custody, damage: [] },
    signatures: {
      hirer: { status: "SIGNED", signedAt: "2026-09-01T10:00:00Z", hasImage: true, required: true },
      additionalDriver: unsigned, sponsor: unsigned, vehicleOutHirer: unsigned, vehicleInHirer: unsigned,
    },
  } as unknown as OfficialContractView;
}

function detail(overrides: Partial<ContractDetailDto> = {}): ContractDetailDto {
  return {
    status: "PAID",
    snapshot: { officialContract: signedView() },
    carOutHandover: { status: "DRAFT", mileageOut: 900, fuelOut: "1/2", damageOut: [{ zone: "T1", type: "DENT" }], signature: { present: true, attachmentId: "a", url: "/sig" }, actualHandoverAt: null },
    carOut: null,
    carIn: null,
    carInHandover: {
      status: "NOT_STARTED",
      mileageIn: null,
      fuelIn: null,
      damageIn: [],
      notes: null,
      photoEvidence: { required: 4, completed: 0, missing: ["FRONT", "REAR", "LEFT", "RIGHT"], complete: false, ready: false, photos: [] },
      signature: { present: false, attachmentId: null, url: null },
      actualReturnAt: null,
      actions: { canEdit: false, canUploadPhotos: false, canDeletePhotos: false, canSign: false, canSaveDraft: false, canComplete: false },
    },
    ...overrides,
  } as unknown as ContractDetailDto;
}

describe("liveContractView", () => {
  it("returns null without a signed snapshot", () => {
    assert.equal(liveContractView(detail({ snapshot: null })), null);
  });

  it("ignores a Car-Out draft", () => {
    const view = liveContractView(detail())!;
    assert.equal(view.vehicleOut.status, "NOT_AVAILABLE");
    assert.equal(view.signatures.vehicleOutHirer.status, "NOT_SIGNED");
    assert.equal(hasPostSigningRecords(detail()), false);
  });

  it("lays a completed Car-Out and Car-In over the signed sheet", () => {
    const d = detail({
      status: "ACTIVE",
      carOut: { id: "o", occurredAt: "2026-09-02T09:00:00Z", mileageOut: 1200, fuelOut: "F", notes: null, damageOut: [{ zone: "L2", type: "SCRATCH" }], vehicleId: 1, hirerSignatureAttachmentId: "a", photos: [] },
      carIn: { id: "i", occurredAt: "2026-09-05T09:00:00Z", mileageIn: 1500, fuelIn: "3/4", notes: null, photos: [] },
    });
    const view = liveContractView(d)!;
    assert.equal(view.contract.status, "ACTIVE");
    assert.deepEqual(
      { status: view.vehicleOut.status, mileage: view.vehicleOut.mileage, fuel: view.vehicleOut.fuel, damage: view.vehicleOut.damage },
      { status: "RECORDED", mileage: 1200, fuel: "F", damage: [{ zone: "L2", type: "SCRATCH" }] },
    );
    assert.equal(view.signatures.vehicleOutHirer.status, "SIGNED");
    assert.equal(view.signatures.vehicleOutHirer.hasImage, true);
    assert.equal(view.vehicleIn.mileage, 1500);
    assert.equal(view.signatures.vehicleInHirer.status, "NOT_SIGNED");
    assert.equal(hasPostSigningRecords(d), true);
  });

  it("lays completed Car-In damage and hirer signature over the signed sheet", () => {
    const damageIn = [{ zone: "LEFT.FRONT_DOOR", type: "DENT" as const }];
    const occurredAt = "2026-09-05T09:00:00Z";
    const d = detail({
      status: "REVIEW",
      carIn: { id: "i", occurredAt, mileageIn: 1500, fuelIn: "3/4", notes: null, photos: [] },
      carInHandover: {
        ...detail().carInHandover,
        status: "COMPLETED",
        mileageIn: 1500,
        fuelIn: "3/4",
        damageIn,
        signature: {
          present: true,
          attachmentId: "in-sig",
          url: "/contracts/c1/car-in/signature/stream",
        },
        actualReturnAt: occurredAt,
      },
    });
    const view = liveContractView(d)!;
    assert.deepEqual(view.vehicleIn.damage, damageIn);
    assert.equal(view.vehicleIn.signatureStatus, "SIGNED");
    assert.equal(view.signatures.vehicleInHirer.status, "SIGNED");
    assert.equal(view.signatures.vehicleInHirer.hasImage, true);
    assert.equal(view.signatures.vehicleInHirer.signedAt, occurredAt);
  });

  it("does not falsely mark Car-In signature when absent", () => {
    const d = detail({
      carIn: {
        id: "i",
        occurredAt: "2026-09-05T09:00:00Z",
        mileageIn: 1500,
        fuelIn: "3/4",
        notes: null,
        photos: [],
      },
      carInHandover: {
        ...detail().carInHandover,
        status: "COMPLETED",
        damageIn: [{ zone: "TOP.HOOD", type: "SCRATCH" }],
        signature: { present: false, attachmentId: null, url: null },
      },
    });
    const view = liveContractView(d)!;
    assert.equal(view.vehicleIn.signatureStatus, "NOT_SIGNED");
    assert.equal(view.signatures.vehicleInHirer.status, "NOT_SIGNED");
    assert.equal(view.signatures.vehicleInHirer.hasImage, false);
  });

  it("does not mutate the frozen snapshot", () => {
    const d = detail({ carOutHandover: { ...detail().carOutHandover, status: "COMPLETED", actualHandoverAt: "2026-09-02T09:00:00Z" } });
    liveContractView(d);
    const frozen = (d.snapshot as { officialContract: OfficialContractView }).officialContract;
    assert.equal(frozen.vehicleOut.status, "NOT_AVAILABLE");
    assert.equal(frozen.signatures.vehicleOutHirer.status, "NOT_SIGNED");
    assert.equal(frozen.signatures.vehicleInHirer.status, "NOT_SIGNED");
  });
});
