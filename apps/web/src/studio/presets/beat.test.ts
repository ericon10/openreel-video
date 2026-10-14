import { describe, expect, it } from "vitest";
import { beatGrid, beatsOnTimeline, nearBeat, tempoFromTaps } from "./beat";

describe("Studio beat sync", () => {
  it("moves the music's beats to where the clip plays", () => {
    // The music starts at 2 s on the timeline and plays from 10 s to 14 s of the file.
    expect(beatsOnTimeline([9.5, 10, 10.5, 13.9, 14, 15], { startTime: 2, inPoint: 10, outPoint: 14 })).toEqual([2, 2.5, 5.9]);
  });

  it("lays a steady grid through the playhead across the whole timeline", () => {
    const g = beatGrid(120, 1.25, 4);
    expect(g[0]).toBe(0.25);
    expect(g).toContain(1.25);
    expect(g.at(-1)).toBe(3.75);
    expect(beatGrid(10, 0, 4)).toEqual([]);
  });

  it("reads the tempo from at least 4 taps, starting over after a pause", () => {
    expect(tempoFromTaps([0, 500, 1000])).toBeNull();
    expect(tempoFromTaps([0, 500, 1000, 1500, 2000])).toBe(120);
    // A pause, then taps at 100 BPM: the old taps do not count.
    expect(tempoFromTaps([0, 500, 1000, 5000, 5600, 6200, 6800])).toBe(100);
  });

  it("pulls a time onto a beat only when it is close", () => {
    const beats = [0, 0.5, 1, 1.5, 2];
    expect(nearBeat(1.04, beats)).toBe(1);
    expect(nearBeat(1.25, beats)).toBe(1.25);
    expect(nearBeat(1.3, [])).toBe(1.3);
  });
});
