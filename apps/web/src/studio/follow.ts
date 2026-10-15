import { calculateProjectDuration, type Project } from "@openreel/core";
import { useEngineStore } from "../stores/engine-store";
import { useProjectStore } from "../stores/project-store";

// The post ends with its last shot (editor QA, 2026-10-15). A caption or a
// sound clip that ended with the last shot keeps ending with it when the
// shots change length: speed a shot up, trim or delete one, and the export
// stops with the video instead of running on over black. One you retimed to
// end somewhere else stays where you put it. The change is not an undo step
// of its own: undoing the shot's change brings the caption back with it.

type Timed = { readonly id: string; readonly startTime: number; readonly duration: number };
type MediaClip = Timed & { readonly mediaId: string; readonly trackId: string; readonly inPoint: number; readonly outPoint: number; readonly speed?: number };
type FollowProject = {
  readonly timeline: { readonly tracks: readonly { readonly clips: readonly MediaClip[] }[] };
  readonly mediaLibrary: { readonly items: readonly { readonly id: string; readonly type: "video" | "audio" | "image"; readonly metadata?: { readonly duration?: number } }[] };
  readonly textClips?: readonly Timed[];
};

// Within this of the old end counts as ending with the shot.
const NEAR = 0.1;
// Shorter than this is left alone rather than squeezed to nothing.
const MIN = 0.3;

export function lastShotEnd(project: FollowProject): number {
  const kind = new Map(project.mediaLibrary.items.map((i) => [i.id, i.type]));
  let end = 0;
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      const k = kind.get(clip.mediaId);
      if (k === "video" || k === "image") end = Math.max(end, clip.startTime + clip.duration);
    }
  }
  return end;
}

export interface FollowPlan {
  text: { id: string; duration: number }[];
  sound: { id: string; trackId: string; duration: number; outPoint: number }[];
}

export function followPlan(project: FollowProject, was: number, end: number): FollowPlan {
  const plan: FollowPlan = { text: [], sound: [] };
  if (was <= 0 || end <= 0 || Math.abs(end - was) < 1e-3) return plan;
  const ends = (c: Timed) => Math.abs(c.startTime + c.duration - was) < NEAR;
  for (const c of project.textClips ?? []) {
    if (ends(c) && end - c.startTime >= MIN) plan.text.push({ id: c.id, duration: end - c.startTime });
  }
  const media = new Map(project.mediaLibrary.items.map((i) => [i.id, i]));
  for (const track of project.timeline.tracks) {
    for (const c of track.clips) {
      const m = media.get(c.mediaId);
      if (m?.type !== "audio" || !ends(c) || end - c.startTime < MIN) continue;
      const speed = c.speed && c.speed > 0 ? c.speed : 1;
      // A longer post can only use the sound the file has.
      const room = m.metadata?.duration ? m.metadata.duration - c.inPoint : Infinity;
      const duration = Math.min(end - c.startTime, room / speed);
      if (duration < MIN || Math.abs(duration - c.duration) < 1e-3) continue;
      plan.sound.push({ id: c.id, trackId: c.trackId, duration, outPoint: c.inPoint + duration * speed });
    }
  }
  return plan;
}

// Watches the project while the editor is open; returns the unsubscribe.
export function followLastShot(): () => void {
  let prev = lastShotEnd(useProjectStore.getState().project as unknown as FollowProject);
  return useProjectStore.subscribe((state) => {
    const project = state.project;
    const end = lastShotEnd(project as unknown as FollowProject);
    if (Math.abs(end - prev) < 1e-3) return;
    const was = prev;
    prev = end;
    const plan = followPlan(project as unknown as FollowProject, was, end);
    if (!plan.text.length && !plan.sound.length) return;
    const engine = useEngineStore.getState().getTitleEngine();
    for (const t of plan.text) engine?.updateTextClip(t.id, { duration: t.duration });
    const text = new Map(plan.text.map((t) => [t.id, t.duration]));
    const sound = new Map(plan.sound.map((s) => [s.id, s]));
    const next = {
      ...project,
      textClips: (project.textClips ?? []).map((c) => (text.has(c.id) ? { ...c, duration: text.get(c.id)! } : c)),
      timeline: {
        ...project.timeline,
        tracks: project.timeline.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            const s = sound.get(c.id);
            return s ? { ...c, duration: s.duration, outPoint: s.outPoint } : c;
          }),
        })),
      },
    } as Project;
    useProjectStore.setState({ project: { ...next, timeline: { ...next.timeline, duration: calculateProjectDuration(next) } } });
  });
}
