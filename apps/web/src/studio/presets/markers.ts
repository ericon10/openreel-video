// Freeze frames and speed ramps change the shot itself and leave no block on
// the Presets track, so the Studio embed marks them there (owner,
// 2026-10-15); a click on a marker opens the shot's Speed Curves panel. The
// same facts label the shot: a shot not at normal speed says so.

interface SpeedClip {
  readonly id: string;
  readonly trackId: string;
  readonly startTime: number;
  readonly duration: number;
  readonly speed?: number;
  readonly speedKeyframes?: readonly { readonly time: number; readonly speed: number }[];
  readonly freezeFrames?: readonly { readonly startTime: number; readonly duration: number }[];
}

export interface TimeMarker { kind: "freeze" | "ramp"; clipId: string; trackId: string; at: number; label: string }

const ramps = (c: SpeedClip) => (c.speedKeyframes ?? []).filter((k) => Math.abs(k.speed - 1) > 1e-3);

export function timeMarkers(tracks: readonly { readonly clips: readonly SpeedClip[] }[]): TimeMarker[] {
  const out: TimeMarker[] = [];
  for (const t of tracks) {
    for (const c of t.clips) {
      for (const f of c.freezeFrames ?? []) out.push({ kind: "freeze", clipId: c.id, trackId: c.trackId, at: c.startTime + f.startTime, label: "Freeze" });
      const r = ramps(c);
      if (r.length) out.push({ kind: "ramp", clipId: c.id, trackId: c.trackId, at: c.startTime + Math.min(...r.map((k) => k.time)), label: "Speed ramp" });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const times = (n: number) => `${Math.round(n * 100) / 100}x`;

// "2x", "0.5x", "Ramp", "Freeze", or "2x · Ramp"; null at normal speed.
export function speedLabel(c: SpeedClip): string | null {
  const parts: string[] = [];
  if (c.speed != null && Math.abs(c.speed - 1) > 1e-3) parts.push(times(c.speed));
  if (ramps(c).length) parts.push("Ramp");
  if (c.freezeFrames?.length) parts.push("Freeze");
  return parts.length ? parts.join(" · ") : null;
}
