import { useProjectStore } from "../../stores/project-store";

// Reorder shots by dragging (Character Studio embed, editor QA 2026-10-15).
// Upstream stacks a clip dropped onto another one on a new track above it,
// so the shots overlap and the rest of the post goes black. In the Studio a
// post is a run of shots: a shot dropped onto another shot on the same
// video track goes in front of it (or after the last one), and the shots
// are laid back to back from where the run started. One undo step.

const EPS = 0.01;

type Placed = { id: string; startTime: number; duration: number };

// The new order and start times; null when the drop does not land on
// another shot (then the normal move applies).
export function reorderPlan(clips: Placed[], movedId: string, originalStart: number, dropTime: number): Placed[] | null {
  const moved = clips.find((c) => c.id === movedId);
  if (!moved) return null;
  const others = clips.filter((c) => c.id !== movedId).sort((a, b) => a.startTime - b.startTime);
  const dropEnd = dropTime + moved.duration;
  const hits = others.some((c) => dropTime < c.startTime + c.duration - EPS && dropEnd > c.startTime + EPS);
  if (!hits) return null;
  // In front of the first shot whose middle is after the drop point.
  let index = others.findIndex((c) => c.startTime + c.duration / 2 > dropTime);
  if (index < 0) index = others.length;
  const order = [...others.slice(0, index), moved, ...others.slice(index)];
  const base = Math.min(originalStart, ...others.map((c) => c.startTime));
  let t = Math.max(0, base);
  return order.map((c) => {
    const placed = { id: c.id, startTime: t, duration: c.duration };
    t += c.duration;
    return placed;
  });
}

// Applies the plan on the track; true when the drop was a reorder.
export async function reorderOnDrop(clipId: string, originalStart: number, dropTime: number): Promise<boolean> {
  const store = useProjectStore.getState();
  const track = store.project.timeline.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  if (!track || track.locked || (track.type !== "video" && track.type !== "image")) return false;
  const clips = track.clips.map((c) => ({ id: c.id, startTime: c.id === clipId ? originalStart : c.startTime, duration: c.duration }));
  const plan = reorderPlan(clips, clipId, originalStart, dropTime);
  if (!plan) return false;
  store.beginHistoryGroup("Reorder shots");
  try {
    // Out of the way first, so no step lands on a shot that has not moved yet.
    const far = Math.max(...clips.map((c) => c.startTime + c.duration)) + 1000;
    let t = far;
    for (const p of plan) { await store.moveClip(p.id, t, track.id); t += p.duration + 1; }
    for (const p of plan) await useProjectStore.getState().moveClip(p.id, p.startTime, track.id);
  } finally {
    store.endHistoryGroup();
  }
  return true;
}
