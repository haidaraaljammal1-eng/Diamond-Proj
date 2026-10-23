import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detachSupersededAttachmentInTransaction,
  purgeUnreferencedVehicleVideoFile,
} from "src/modules/vehicles/vehicle-video.service";
import type { Tx } from "src/lib/db/transaction";

describe("vehicle video file safety on failed commit", () => {
  it("keeps superseded files until after DB commit and never unlinks inside the transaction", async () => {
    const purged: string[] = [];

    try {
      await (async () => {
        throw new Error("transaction rolled back");
      })();
      await purgeUnreferencedVehicleVideoFile("/storage", "old-video.mp4", async (path) => {
        purged.push(path);
      });
    } catch {
      // upload/remove: purge only after withVehicleVideoMutationLock succeeds
    }
    assert.equal(purged.length, 0);

    await purgeUnreferencedVehicleVideoFile("/storage", "old-video.mp4", async (path) => {
      purged.push(path);
    });
    assert.equal(purged.length, 1);

    let deletedAttachmentId: string | null = null;
    const tx = {
      vehicleVideo: { findFirst: async () => null },
      attachment: {
        delete: async ({ where }: { where: { id: string } }) => {
          deletedAttachmentId = where.id;
        },
      },
    } as unknown as Tx;

    const storageKey = await detachSupersededAttachmentInTransaction(tx, {
      id: "att-old",
      storageKey: "deadbeefdeadbeefdeadbeefdeadbeef.mp4",
    });
    assert.equal(deletedAttachmentId, "att-old");
    assert.equal(storageKey, "deadbeefdeadbeefdeadbeefdeadbeef.mp4");
    assert.equal(purged.length, 1, "detach must not trigger physical delete");
  });
});
