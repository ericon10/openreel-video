import { describe, expect, it } from "vitest";
import { speedLabel, timeMarkers } from "./markers";
import { trackNames } from "./trackNames";

// Usability fixes from the editor audit (owner, 2026-10-15).
describe("freeze and speed ramp markers", () => {
  const shot = { id: "a", trackId: "t", startTime: 2, duration: 4, freezeFrames: [{ startTime: 0.5, duration: 1.2 }], speedKeyframes: [{ time: 0, speed: 1 }, { time: 1.5, speed: 0.4 }, { time: 2, speed: 1 }] };
  it("marks each on the timeline at its time", () => {
    expect(timeMarkers([{ clips: [shot] }])).toEqual([
      { kind: "freeze", clipId: "a", trackId: "t", at: 2.5, label: "Freeze" },
      { kind: "ramp", clipId: "a", trackId: "t", at: 3.5, label: "Speed ramp" },
    ]);
  });
  it("labels a shot that is not at normal speed", () => {
    expect(speedLabel({ id: "b", trackId: "t", startTime: 0, duration: 2, speed: 2 })).toBe("2x");
    expect(speedLabel({ id: "b", trackId: "t", startTime: 0, duration: 2, speed: 0.5 })).toBe("0.5x");
    expect(speedLabel(shot)).toBe("Ramp · Freeze");
    expect(speedLabel({ id: "c", trackId: "t", startTime: 0, duration: 2, speed: 1, speedKeyframes: [{ time: 0, speed: 1 }] })).toBeNull();
  });
});

describe("track names", () => {
  const roles: Record<string, "clip" | "broll" | "music" | "voice"> = { v1: "clip", b1: "broll", m1: "music", vo: "voice" };
  it("names the Studio's tracks by what is on them and keeps a name the owner gave", () => {
    expect(trackNames([
      { id: "1", name: "Track 1", clips: [{ mediaId: "v1" }, { mediaId: "b1" }] },
      { id: "2", name: "Track 2", clips: [{ mediaId: "vo" }] },
      { id: "3", name: "Track 3", clips: [{ mediaId: "m1" }] },
      { id: "4", name: "My music", clips: [{ mediaId: "m1" }] },
      { id: "5", name: "Captions", clips: [] },
    ], (id) => roles[id])).toEqual([
      { trackId: "1", name: "Shots" },
      { trackId: "2", name: "Voice" },
      { trackId: "3", name: "Music" },
    ]);
  });
});
