// Safe zones (Character Studio long run part 4, owner 2026-10-15): where
// TikTok and Instagram Reels draw their own buttons, captions and bars over
// a 9:16 video, as fractions of the frame. Approximate: the apps move them
// now and then, so they are a guide for where captions read, never a rule.

export type SafeZoneApp = "off" | "tiktok" | "reels";

export interface Band { label: string; x: number; y: number; w: number; h: number }

export const ZONES: Record<Exclude<SafeZoneApp, "off">, { label: string; bands: Band[] }> = {
  tiktok: {
    label: "TikTok",
    bands: [
      { label: "Top bar", x: 0, y: 0, w: 1, h: 0.08 },
      { label: "Buttons", x: 0.86, y: 0.33, w: 0.14, h: 0.46 },
      { label: "Caption and sound", x: 0, y: 0.79, w: 1, h: 0.21 },
    ],
  },
  reels: {
    label: "Reels",
    bands: [
      { label: "Top bar", x: 0, y: 0, w: 1, h: 0.1 },
      { label: "Buttons", x: 0.86, y: 0.45, w: 0.14, h: 0.35 },
      { label: "Caption and audio", x: 0, y: 0.8, w: 1, h: 0.2 },
    ],
  },
};

export interface Box { left: number; top: number; width: number; height: number }

// A band in the overlay's pixels, from the canvas box inside it.
export function bandBox(b: Band, canvas: Box): Box {
  return { left: canvas.left + b.x * canvas.width, top: canvas.top + b.y * canvas.height, width: b.w * canvas.width, height: b.h * canvas.height };
}

// Whether a point of the frame (fractions) is under one of the app's bands.
export function covered(app: SafeZoneApp, x: number, y: number): Band | null {
  if (app === "off") return null;
  return ZONES[app].bands.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
}

const KEY = "studio.safezones";
export function readChoice(): SafeZoneApp {
  try { const v = localStorage.getItem(KEY); return v === "tiktok" || v === "reels" ? v : "off"; } catch { return "off"; }
}
export function saveChoice(v: SafeZoneApp): void {
  try { localStorage.setItem(KEY, v); } catch { /* private window */ }
}
