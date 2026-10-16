import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const data = await readFile("C:/Users/Rw/AppData/Local/Temp/diamond-expired-jpg/actual-production-export.jpg");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const png = await page.evaluate(async (arr) => {
  const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type: "image/jpeg" }));
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d").drawImage(bmp, 0, 0);
  bmp.close();
  return Array.from(new Uint8Array(await new Promise((r) => c.toBlob((b) => b.arrayBuffer().then((ab) => r(ab)), "image/png"))));
}, [...data]);
await browser.close();
const pngBytes = Buffer.from(png);
const b = `----P${Date.now()}`;
const body = Buffer.concat([
  Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="image"; filename="e.png"\r\nContent-Type: image/png\r\n\r\n`),
  pngBytes,
  Buffer.from(`\r\n--${b}--\r\n`),
]);
const j = await (await fetch("http://127.0.0.1:8020/extract-driving-license", {
  method: "POST",
  headers: { "Content-Type": `multipart/form-data; boundary=${b}` },
  body,
})).json();
const ln = j.fields?.license_number?.value ?? "";
const ex = j.fields?.expiry_date?.value ?? "";
console.log(
  JSON.stringify({
    document_status: String(j.document_status ?? "?").toUpperCase(),
    number_extracted: Boolean(String(ln).trim()),
    expiry_extracted: Boolean(String(ex).trim()),
    bytes: pngBytes.length,
  }),
);
