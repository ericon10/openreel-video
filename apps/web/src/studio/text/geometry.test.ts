import { describe, expect, it } from "vitest";
import type { TextClip } from "@openreel/core";
import { capScaleToFrame } from "./geometry";

// A caption is never taller than the frame (owner, 2026-10-15).
describe("capScaleToFrame", () => {
  const clip = { transform: { scale: { x: 1, y: 1 }, position: { x: 0.5, y: 0.3 } } } as unknown as TextClip;
  // A caption 100 px tall at scale 1 that wraps into more lines as it grows:
  // at scale s it takes ceil(s) lines of 100 px (before its own scale).
  const measure = (c: TextClip) => ({ height: 100 * Math.ceil(c.transform.scale.x) });
  const frame = { width: 1080, height: 1920 };

  it("leaves a size that fits", () => {
    expect(capScaleToFrame(clip, frame, { x: 2, y: 2 }, measure)).toEqual({ x: 2, y: 2 });
  });

  it("stops at the frame's height", () => {
    const r = capScaleToFrame(clip, frame, { x: 9, y: 9 }, measure);
    expect(measure({ ...clip, transform: { ...clip.transform, scale: r } } as TextClip).height * r.y).toBeLessThanOrEqual(1920);
    expect(r.x).toBeGreaterThan(3.5);
    expect(r.x).toBe(r.y);
  });
});
