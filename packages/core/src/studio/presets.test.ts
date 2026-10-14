import { describe, expect, it } from "vitest";
import { studioLayerOrphaned } from "./camera";
import { cameraAt, ease, PRESETS, presetById, presetData, shakeOffset, speedAt, STRENGTH_SCALE } from "./presets";

describe("Character Studio presets", () => {
  it("every preset has a label, a line, a thumbnail and what its kind needs", () => {
    const ids = new Set<string>();
    for (const p of PRESETS) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.line.length).toBeGreaterThan(10);
      expect(p.thumb).toMatch(/^[a-z_]+$/);
      if (p.kind === "camera") expect(p.keys?.length).toBeGreaterThan(1);
      if (p.kind === "time") expect(Boolean(p.speed || p.freeze || p.reverse)).toBe(true);
      if (p.anchor === "cut") expect(p.category).toBe("transition");
    }
    // The owner's list, all present.
    for (const id of ["crash_zoom", "whip_pan", "zoom_through", "spin", "glitch", "flash_cut", "hand_lens", "match_cut", "speed_ramp", "velocity", "snap_zoom", "punch_in", "shake", "freeze_pop", "record_scratch", "dolly_zoom", "push_in", "pull_out", "rewind", "karaoke", "word_pop", "text_behind", "caption_slam", "look_box", "look_outline", "split_screen", "pip", "green_screen"]) {
      expect(presetById(id), id).toBeTruthy();
    }
  });

  it("holds before the first key and after the last, and eases between", () => {
    const snap = presetById("snap_zoom")!;
    expect(cameraAt(snap.keys!, 0).scale).toBe(1);
    expect(cameraAt(snap.keys!, 1).scale).toBeCloseTo(1.4);
    const mid = cameraAt(snap.keys!, 0.05).scale;
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(1.4);
    // Out-expo is past halfway at half the time.
    expect(mid - 1).toBeGreaterThan(0.2);
  });

  it("strength scales the distance from as-shot, never the as-shot value itself", () => {
    const keys = presetById("snap_zoom")!.keys!;
    const s = cameraAt(keys, 1, "subtle").scale, n = cameraAt(keys, 1, "normal").scale, x = cameraAt(keys, 1, "strong").scale;
    expect(s).toBeCloseTo(1 + 0.4 * STRENGTH_SCALE.subtle);
    expect(n).toBeCloseTo(1.4);
    expect(x).toBeCloseTo(1 + 0.4 * STRENGTH_SCALE.strong);
    expect(cameraAt(keys, 0, "strong").scale).toBe(1);
  });

  it("a crash zoom peaks just before the cut and settles after it", () => {
    const keys = presetById("crash_zoom")!.keys!;
    const before = cameraAt(keys, 0.47).scale, after = cameraAt(keys, 0.75).scale;
    expect(before).toBeGreaterThan(1.3);
    expect(after).toBeLessThan(before);
    expect(cameraAt(keys, 1).scale).toBeCloseTo(1);
  });

  it("flash and dark stay between 0 and 1 even when strong", () => {
    const f = cameraAt(presetById("flash_cut")!.keys!, 0.5, "strong");
    expect(f.flash).toBeLessThanOrEqual(1);
    expect(cameraAt(presetById("hand_lens")!.keys!, 0.5, "strong").dark).toBeLessThanOrEqual(1);
  });

  it("easings start at 0 and end at 1", () => {
    for (const e of ["linear", "in", "out", "inOut", "inExpo", "outExpo", "outBack"] as const) {
      expect(ease(e, 0)).toBeCloseTo(0);
      expect(ease(e, 1)).toBeCloseTo(1);
    }
    expect(ease("hold", 0.99)).toBe(0);
  });

  it("the shake is deterministic and zero when off", () => {
    expect(shakeOffset(1.234, 0.03)).toEqual(shakeOffset(1.234, 0.03));
    expect(shakeOffset(1.234, 0)).toEqual({ dx: 0, dy: 0, rot: 0 });
  });

  it("speed curves interpolate between points", () => {
    const v = presetById("velocity")!.speed!;
    expect(speedAt(v, 0)).toBeCloseTo(2.2);
    expect(speedAt(v, 0.5)).toBeCloseTo(0.35);
    expect(speedAt(v, 1)).toBeCloseTo(2.2);
  });

  it("a block's data copies the preset's keys and strength", () => {
    const d = presetData(presetById("glitch")!, "strong");
    expect(d).toMatchObject({ version: 1, preset: "glitch", strength: "strong" });
    expect(d.keys.length).toBe(presetById("glitch")!.keys!.length);
  });

  it("a preset on a missing track moves the whole frame; on its track, only the loop applies it", () => {
    const layer = { trackId: "presets", startTime: 0, duration: 1, enabled: true, opacity: 1, studio: presetData(presetById("snap_zoom")!, "normal") };
    expect(studioLayerOrphaned(layer, new Set(["presets", "video"]))).toBe(false);
    expect(studioLayerOrphaned(layer, new Set(["video"]))).toBe(true);
    expect(studioLayerOrphaned({ ...layer, studio: undefined }, new Set())).toBe(false);
  });
});
