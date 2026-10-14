import { useProjectStore } from "../../stores/project-store";

// Ripple trim (Character Studio embed): when a shot is trimmed shorter,
// the shots after it on the same track slide over so no gap opens (the
// post is a run of shots). On by default; the switch is in the Studio bar.
// Trimming longer is left as is.

let ripple = true;
export const rippleOn = (): boolean => ripple;
export const setRipple = (on: boolean): void => { ripple = on; };

const EPS = 0.01;

export async function rippleAfterTrim(clipId: string, edge: "left" | "right", before: { startTime: number; duration: number }): Promise<void> {
  if (!ripple) return;
  const store = useProjectStore.getState();
  const track = store.project.timeline.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || !clip || track.locked) return;
  if (edge === "left") {
    // The start moved later: slide this shot (and the rest) back.
    if (clip.startTime - before.startTime > EPS) await store.closeGapBeforeClip(clip.id);
    return;
  }
  const oldEnd = before.startTime + before.duration;
  const newEnd = clip.startTime + clip.duration;
  if (oldEnd - newEnd <= EPS) return;
  const next = [...track.clips].filter((c) => c.id !== clip.id && c.startTime >= oldEnd - EPS).sort((a, b) => a.startTime - b.startTime)[0];
  // Only when the next shot was butted against this one.
  if (next && Math.abs(next.startTime - oldEnd) <= 0.05) await store.closeGapBeforeClip(next.id);
}
