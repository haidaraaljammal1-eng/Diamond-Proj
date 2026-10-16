import { staffToken } from "./helpers/e2e-api.ts";

const t = await staffToken();
const v = await fetch("http://localhost:8000/vehicles?limit=5&active=true", {
  headers: { Authorization: `Bearer ${t}` },
});
const j = await v.json();
console.log(
  JSON.stringify({
    backend: "ok",
    vehiclesHttp: v.status,
    items: j.data?.items?.length ?? null,
    total: j.data?.total ?? null,
  }),
);
