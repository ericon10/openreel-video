import { describe, expect, it } from "vitest";
import { ZONES, bandBox, covered } from "./zones";

describe("safe zones", () => {
  it("places each band on the canvas, in the overlay's pixels", () => {
    const canvas = { left: 100, top: 20, width: 360, height: 640 };
    const buttons = ZONES.tiktok.bands.find((b) => b.label === "Buttons")!;
    const r = bandBox(buttons, canvas);
    expect(r.left).toBeCloseTo(100 + 0.86 * 360);
    expect(r.top).toBeCloseTo(20 + 0.33 * 640);
    expect(r.width).toBeCloseTo(0.14 * 360);
  });
  it("says which band covers a point; the middle of the frame is clear", () => {
    expect(covered("tiktok", 0.5, 0.5)).toBeNull();
    expect(covered("tiktok", 0.5, 0.9)?.label).toBe("Caption and sound");
    expect(covered("reels", 0.95, 0.6)?.label).toBe("Buttons");
    expect(covered("off", 0.5, 0.9)).toBeNull();
  });
  it("every band sits inside the frame", () => {
    for (const z of Object.values(ZONES)) for (const b of z.bands) {
      expect(b.x + b.w).toBeLessThanOrEqual(1);
      expect(b.y + b.h).toBeLessThanOrEqual(1.0001);
    }
  });
});
