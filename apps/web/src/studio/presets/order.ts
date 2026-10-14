import type { Track } from "@openreel/core";

// Track order in the Character Studio embed, top to bottom: captions and
// other text, the Presets track, the footage, then audio. A track paints
// over the ones below it and a preset moves only the tracks below it, so
// the caption stays on screen and still over a zoom.

export const PRESETS_TRACK = "Presets";

type TrackLike = Pick<Track, "type" | "name" | "role">;

export function studioTrackRank(t: TrackLike): number {
  if (t.type === "text") return 0;
  if (t.name === PRESETS_TRACK && t.role === "effects") return 1;
  if (t.type === "audio") return 3;
  return 2;
}

// A saved project from before this order had its caption under the video.
export function orderStudioTracks<T extends TrackLike>(list: readonly T[]): T[] {
  return list
    .map((t, i) => ({ t, i }))
    .sort((a, b) => studioTrackRank(a.t) - studioTrackRank(b.t) || a.i - b.i)
    .map((x) => x.t);
}
