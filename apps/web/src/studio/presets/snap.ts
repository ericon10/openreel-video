import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { cuts } from "./actions";
import { beatTimes } from "./beat";

// Where preset blocks snap (Character Studio embed): cuts between shots,
// beat markers, timeline markers (the Studio's suggested spots among them)
// and the playhead.

export function snapPoints(): number[] {
  const p = useProjectStore.getState().project;
  // Beats live in OpenReel's beat bridge (its overlay draws them).
  const beats = [...beatTimes(), ...(p.timeline.beatMarkers ?? []).map((b) => b.time)];
  const markers = p.timeline.markers.map((m) => m.time);
  return [...cuts(), ...beats, ...markers, useTimelineStore.getState().playheadPosition, 0];
}

// Extra snap points for clips and captions dragged on the timeline: beats
// and markers (OpenReel's own snapping covers clips, the playhead and the
// grid).
export function studioClipSnapPoints(): number[] {
  const p = useProjectStore.getState().project;
  return [...beatTimes(), ...p.timeline.markers.map((m) => m.time)];
}

export function snapTime(t: number, tolerance: number, points = snapPoints()): number {
  let best = t;
  let dist = tolerance;
  for (const q of points) {
    const d = Math.abs(q - t);
    if (d < dist) { dist = d; best = q; }
  }
  return best;
}
