import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { detectLocalSaveCapability } from "./whatsapp-local-save-capability.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function restore(name: "window" | "navigator", descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, name);
}

afterEach(() => {
  restore("window", originalWindow);
  restore("navigator", originalNavigator);
});

describe("local save capability", { concurrency: false }, () => {
  it("does not read window while the page is rendering on the server", () => {
    Reflect.deleteProperty(globalThis, "window");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node" },
    });
    assert.equal(detectLocalSaveCapability(), "manual");
  });

  it("keeps directory saving on a browser that can choose a folder", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Mozilla/5.0 Chrome" },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { showDirectoryPicker: () => undefined },
    });
    assert.equal(detectLocalSaveCapability(), "directory");
  });

  it("keeps the manual download path on iPhone", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "iPhone" },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    assert.equal(detectLocalSaveCapability(), "iphone");
  });

  it("uses manual download when the browser cannot choose a folder", () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "Mozilla/5.0" },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    assert.equal(detectLocalSaveCapability(), "manual");
  });
});
