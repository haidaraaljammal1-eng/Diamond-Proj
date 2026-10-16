import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ORIGINAL = path.resolve(
  "C:/Users/Rw/.cursor/projects/c-Users-Rw-Documents-DIAMOND-SYSTEM/assets/c__Users_Rw_AppData_Roaming_Cursor_User_workspaceStorage_ed577a768a71940254545da375e80d22_images_image-3d3cbc29-70a7-4844-a532-49cb350c1cff.png",
);
const ENGINE = "http://127.0.0.1:8020/extract-driving-license";
const FRONTEND = "http://127.0.0.1:3100";
const BACKEND = "http://127.0.0.1:8000";
const OUT_DIR = "C:/Users/Rw/AppData/Local/Temp/diamond-rc";

async function postEngine(bytes, filename, mime) {
  const boundary = `----RC${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(ENGINE, { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
  return res.json();
}

function summarize(payload) {
  const fields = payload.fields ?? {};
  const ln = fields.license_number ?? {};
  const ex = fields.expiry_date ?? {};
  return {
    document_status: String(payload.document_status ?? "UNKNOWN").toUpperCase(),
    number_extracted: Boolean(String(ln.value ?? "").trim()),
    expiry_extracted: Boolean(String(ex.value ?? "").trim()),
  };
}

async function imageMeta(page, bytes) {
  return await page.evaluate(async (arr) => {
    const blob = new Blob([new Uint8Array(arr)]);
    const bmp = await createImageBitmap(blob);
    return { width: bmp.width, height: bmp.height };
  }, [...bytes]);
}

async function noopCanvas(page, inputBytes, mime, quality) {
  return await page.evaluate(
    async ({ arr, mime, quality }) => {
      const blob = new Blob([new Uint8Array(arr)]);
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0);
      const out = await new Promise((resolve) => {
        c.toBlob((b) => {
          if (!b) resolve(null);
          else b.arrayBuffer().then((ab) => resolve(Array.from(new Uint8Array(ab))));
        }, mime, quality);
      });
      return { width: c.width, height: c.height, out };
    },
    { arr: [...inputBytes], mime, quality },
  );
}

async function staffSeedToken() {
  const login = await fetch(`${BACKEND}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@diamond.test", password: "Diamond123!" }),
  });
  const { data } = await login.json();
  const token = data.accessToken;
  const vehicles = await (
    await fetch(`${BACKEND}/vehicles?operationalStatus=AVAILABLE&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const vehicleId = vehicles.data?.items?.[0]?.id;
  const offerRes = await fetch(`${BACKEND}/contracts/offers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ vehicleId, priceType: "DAILY", rentalDays: 3, agreedAmount: 1200, collectionMode: "ELECTRONIC" }),
  });
  const offerJson = await offerRes.json();
  const offerId = offerJson.data?.id ?? offerJson.id;
  const link = await (
    await fetch(`${BACKEND}/contracts/${offerId}/rental-link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  return link.data?.link?.token ?? link.link?.token;
}

await mkdir(OUT_DIR, { recursive: true });
const report = { A: {}, B: {}, C: {}, D: null };
const originalBytes = await readFile(ORIGINAL);
const originalMime = "image/png";

report.A = {
  dimensions: "651x387",
  mime: originalMime,
  bytes: originalBytes.length,
  ...summarize(await postEngine(originalBytes, "original.png", originalMime)),
};

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();

const noop = await noopCanvas(page, originalBytes, "image/png", undefined);
const noopBytes = Buffer.from(noop.out);
await writeFile(path.join(OUT_DIR, "noop-canvas.png"), noopBytes);
report.B = {
  dimensions: `${noop.width}x${noop.height}`,
  mime: "image/png",
  bytes: noopBytes.length,
  ...summarize(await postEngine(noopBytes, "noop.png", "image/png")),
};

async function mirrorDialogExport(page, inputBytes, viewport) {
  return await page.evaluate(async ({ arr, viewport }) => {
    const guideAspect = 1.59;
    const inset = 0.92;
    const maxGuideFraction = 0.88;
    const blob = new Blob([new Uint8Array(arr)], { type: "image/png" });
    const image = await createImageBitmap(blob);
    const sw = image.width;
    const sh = image.height;
    const vw = viewport.width * inset;
    const vh = viewport.height * inset;
    const baseFit = Math.min(vw / sw, vh / sh);
    const maxW = viewport.width * maxGuideFraction;
    const maxH = viewport.height * maxGuideFraction;
    let gW = maxW;
    let gH = gW / guideAspect;
    if (gH > maxH) {
      gH = maxH;
      gW = gH * guideAspect;
    }
    const zoomW = gW / (sw * baseFit);
    const zoomH = gH / (sh * baseFit);
    let zoom = Math.min(zoomW, zoomH);
    zoom = Math.min(4, Math.max(0.35, zoom));
    const transform = { panX: 0, panY: 0, zoom, rotationDeg: 0 };
    const displayScale = baseFit * transform.zoom;
    const displayW = sw * displayScale;
    const displayH = sh * displayScale;
    const needW = sw / displayW;
    const needH = sh / displayH;
    let pixelRatio = Math.max(1, needW, needH);
    pixelRatio = Math.min(8, Math.ceil(pixelRatio * 100) / 100);
    const guide = { left: (viewport.width - gW) / 2, top: (viewport.height - gH) / 2, width: gW, height: gH };
    const vpW = Math.max(1, Math.ceil(viewport.width * pixelRatio));
    const vpH = Math.max(1, Math.ceil(viewport.height * pixelRatio));
    const viewportCanvas = document.createElement("canvas");
    viewportCanvas.width = vpW;
    viewportCanvas.height = vpH;
    const vpCtx = viewportCanvas.getContext("2d");
    vpCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    vpCtx.fillStyle = "#ffffff";
    vpCtx.fillRect(0, 0, viewport.width, viewport.height);
    const cx = viewport.width / 2 + transform.panX;
    const cy = viewport.height / 2 + transform.panY;
    vpCtx.save();
    vpCtx.translate(cx, cy);
    vpCtx.rotate(0);
    vpCtx.drawImage(image, -displayW / 2, -displayH / 2, displayW, displayH);
    vpCtx.restore();
    vpCtx.setTransform(1, 0, 0, 1, 0, 0);
    const cropX = Math.floor(guide.left * pixelRatio);
    const cropY = Math.floor(guide.top * pixelRatio);
    const cropW = Math.max(1, Math.ceil(guide.width * pixelRatio));
    const cropH = Math.max(1, Math.ceil(guide.height * pixelRatio));
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cropW, cropH);
    ctx.drawImage(viewportCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    const out = await new Promise((resolve) => {
      canvas.toBlob((b) => b?.arrayBuffer().then((ab) => resolve(Array.from(new Uint8Array(ab)))), "image/png");
    });
    image.close();
    return { width: cropW, height: cropH, out, zoom, guideAspect: cropW / cropH };
  }, { arr: [...inputBytes], viewport });
}

const viewport = { width: 640, height: 400 };
const mirrored = await mirrorDialogExport(page, originalBytes, viewport);
let dialogBytes = Buffer.from(mirrored.out);
report.C_source = "mirror_dialog_export_same_logic_as_production";

if (dialogBytes) {
  await writeFile(path.join(OUT_DIR, "dialog-export.png"), dialogBytes);
  const dm = { width: mirrored.width, height: mirrored.height };
  const mime = dialogBytes[0] === 0xff && dialogBytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  report.C = {
    dimensions: `${dm.width}x${dm.height}`,
    mime,
    bytes: dialogBytes.length,
    aspect: (dm.width / dm.height).toFixed(3),
    ...summarize(await postEngine(dialogBytes, "dialog.bin", mime)),
  };

  if (report.B.document_status === "ACCEPT" && report.C.document_status === "REJECT") {
    const pngFromDialog = await page.evaluate(async (arr) => {
      const blob = new Blob([new Uint8Array(arr)]);
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      return Array.from(
        new Uint8Array(
          await new Promise((resolve) => {
            c.toBlob((b) => b?.arrayBuffer().then((ab) => resolve(ab)));
          }, "image/png"),
        ),
      );
    }, [...dialogBytes]);
    const dBytes = Buffer.from(pngFromDialog);
    report.D = { mime: "image/png", bytes: dBytes.length, ...summarize(await postEngine(dBytes, "d.png", "image/png")) };
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
