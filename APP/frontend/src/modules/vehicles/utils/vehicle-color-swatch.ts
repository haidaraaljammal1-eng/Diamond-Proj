const NAMED_COLORS: Record<string, string> = {
  white: "#f8f8f6",
  black: "#1a1a1a",
  silver: "#c0c0c0",
  gray: "#808080",
  grey: "#808080",
  red: "#c0392b",
  blue: "#2563eb",
  green: "#15803d",
  yellow: "#eab308",
  gold: "#c9a15c",
  beige: "#d4c4a8",
  brown: "#6b4423",
  orange: "#ea580c",
  purple: "#7c3aed",
  pink: "#db2777",
  navy: "#1e3a5f",
  maroon: "#7f1d1d",
  champagne: "#f5e6c8",
  ivory: "#fffff0",
  pearl: "#f0ebe3",
  "pearl white": "#f0ebe3",
  "dark gray": "#4b5563",
  "light gray": "#d1d5db",
  charcoal: "#36454f",
  bronze: "#cd7f32",
  copper: "#b87333",
  cream: "#fffdd0",
  tan: "#d2b48c",
  burgundy: "#800020",
  turquoise: "#40e0d0",
  cyan: "#06b6d4",
  lime: "#84cc16",
  olive: "#808000",
  teal: "#0d9488",
  violet: "#8b5cf6",
  magenta: "#d946ef",
  أبيض: "#f8f8f6",
  اسود: "#1a1a1a",
  أسود: "#1a1a1a",
  فضي: "#c0c0c0",
  رمادي: "#808080",
  احمر: "#c0392b",
  أحمر: "#c0392b",
  ازرق: "#2563eb",
  أزرق: "#2563eb",
  اخضر: "#15803d",
  أخضر: "#15803d",
  ذهبي: "#c9a15c",
  بني: "#6b4423",
  برتقالي: "#ea580c",
};

function normalizeColorKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns a CSS color for known labels; null when unknown (neutral swatch). */
export function resolveVehicleColorCss(color: string | null | undefined): string | null {
  if (!color?.trim()) return null;
  const key = normalizeColorKey(color);
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(key)) return key;
  return null;
}

export function vehicleColorSwatchNeedsBorder(cssColor: string | null): boolean {
  if (!cssColor) return true;
  if (cssColor.toLowerCase() === "#ffffff" || cssColor.toLowerCase() === "#fff") return true;
  if (cssColor.startsWith("#")) {
    const hex = cssColor.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.88;
    }
  }
  return false;
}
