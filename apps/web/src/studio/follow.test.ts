import { describe, expect, it } from "vitest";
import { followPlan, lastShotEnd } from "./follow";

// The post ends with its last shot (editor QA, 2026-10-15).
describe("followPlan", () => {
  const project = (shotEnd: number) => ({
    mediaLibrary: { items: [
      { id: "v", type: "video" as const, metadata: { duration: 6 } },
      { id: "m", type: "audio" as const, metadata: { duration: 12 } },
      { id: "vo", type: "audio" as const, metadata: { duration: 2 } },
    ] },
    timeline: { tracks: [
      { clips: [{ id: "shot", mediaId: "v", trackId: "t1", startTime: 0, duration: shotEnd, inPoint: 0, outPoint: 6, speed: 6 / shotEnd }] },
      { clips: [{ id: "music", mediaId: "m", trackId: "t2", startTime: 0, duration: 6, inPoint: 0, outPoint: 6 }] },
      { clips: [{ id: "voice", mediaId: "vo", trackId: "t3", startTime: 0.5, duration: 2, inPoint: 0, outPoint: 2 }] },
    ] },
    textClips: [
      { id: "caption", startTime: 0, duration: 6 },
      { id: "word", startTime: 1, duration: 1.2 },
    ],
  });

  it("finds the end of the last shot (video and images, not sound or text)", () => {
    expect(lastShotEnd(project(4))).toBe(4);
  });

  it("brings the caption and the music that ended with the shot back to its new end", () => {
    expect(followPlan(project(4), 6, 4)).toEqual({
      text: [{ id: "caption", duration: 4 }],
      sound: [{ id: "music", trackId: "t2", duration: 4, outPoint: 4 }],
    });
  });

  it("leaves what ended elsewhere: a voice line, a word caption", () => {
    const plan = followPlan(project(4), 6, 4);
    expect(plan.text.map((t) => t.id)).not.toContain("word");
    expect(plan.sound.map((s) => s.id)).not.toContain("voice");
  });

  it("follows a longer post too, as far as the sound file goes", () => {
    const p = project(4);
    const shorter = { ...p, timeline: { tracks: [p.timeline.tracks[0]!, { clips: [{ ...p.timeline.tracks[1]!.clips[0]!, duration: 4, outPoint: 4 }] }] }, textClips: [{ id: "caption", startTime: 0, duration: 4 }] };
    expect(followPlan(shorter, 4, 14)).toEqual({
      text: [{ id: "caption", duration: 14 }],
      sound: [{ id: "music", trackId: "t2", duration: 12, outPoint: 12 }],
    });
  });

  it("does nothing when the end did not move", () => {
    expect(followPlan(project(6), 6, 6)).toEqual({ text: [], sound: [] });
  });
});
