/**
 * Builds the full brand palette (50-900) from the one colour an admin picks. The picked colour
 * becomes shade 700 (the main button colour); lighter shades mix toward white, darker toward black.
 */
export const BRAND_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;
export type BrandShade = (typeof BRAND_SHADES)[number];

// Share of white (positive) or black (negative) mixed into the picked colour.
const MIX: Record<BrandShade, number> = {
  "50": 0.93,
  "100": 0.85,
  "200": 0.7,
  "300": 0.52,
  "400": 0.33,
  "500": 0.17,
  "600": 0.08,
  "700": 0,
  "800": -0.16,
  "900": -0.3,
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function generateBrandShades(hex: string): Record<BrandShade, string> {
  const base = hexToRgb(hex);
  const out = {} as Record<BrandShade, string>;
  for (const shade of BRAND_SHADES) {
    const mix = MIX[shade];
    const target = mix >= 0 ? 255 : 0;
    const amount = Math.abs(mix);
    out[shade] = rgbToHex(base.map((c) => c + (target - c) * amount) as [number, number, number]);
  }
  return out;
}

/** CSS that overrides the brand colour variables for the whole page. */
export function brandCss(hex: string): string {
  const shades = generateBrandShades(hex);
  const vars = BRAND_SHADES.map((s) => `--color-brand-${s}:${shades[s]};`).join("");
  return `:root{${vars}}`;
}
