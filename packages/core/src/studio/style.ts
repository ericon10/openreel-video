// Saved styles (Character Studio embed): a stack of presets with places
// relative to the video ("at the payoff", "on cut 2", "on beat 8", "1.5 s
// from the end") instead of seconds, so the same stack lands sensibly on
// another post. The Studio's server/core/editorStyle.ts holds the same
// rules (and the same test vectors) for its worker.

import type { CameraKey, PresetStrength } from "./presets";

export type AnchorOn = "payoff" | "cut" | "beat" | "start" | "end";

export interface Anchor {
  on: AnchorOn;
  index: number;
  offset: number;
  // Share of the video, used when the cut or beat is missing on the new post.
  ratio: number;
}

export interface StyleItem {
  preset: string;
  strength: PresetStrength;
  at: Anchor;
  // Camera presets: the block's length and edited keys (null: the preset's own).
  duration: number | null;
  keys: CameraKey[] | null;
}

export interface SavedStyle {
  id: string;
  name: string;
  items: StyleItem[];
  createdAt: string;
}

export interface Places {
  duration: number;
  payoff: number | null;
  // Cuts between shots (not 0 or the end), and beats, in seconds.
  cuts: number[];
  beats: number[];
}

const NEAR = 0.06;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function nearest(list: readonly number[], t: number): number {
  let best = -1;
  let dist = NEAR;
  list.forEach((x, i) => {
    const d = Math.abs(x - t);
    if (d <= dist) { dist = d; best = i; }
  });
  return best;
}

export function anchorFor(t: number, p: Places): Anchor {
  const ratio = p.duration > 0 ? Math.max(0, Math.min(1, t / p.duration)) : 0;
  if (p.payoff != null && Math.abs(t - p.payoff) <= NEAR) return { on: "payoff", index: 0, offset: 0, ratio };
  const cut = nearest(p.cuts, t);
  if (cut >= 0) return { on: "cut", index: cut, offset: r3(t - p.cuts[cut]!), ratio };
  const beat = nearest(p.beats, t);
  if (beat >= 0) return { on: "beat", index: beat, offset: r3(t - p.beats[beat]!), ratio };
  if (p.payoff != null && Math.abs(t - p.payoff) <= 1.5) return { on: "payoff", index: 0, offset: r3(t - p.payoff), ratio };
  if (t > p.duration / 2) return { on: "end", index: 0, offset: r3(Math.max(0, p.duration - t)), ratio };
  return { on: "start", index: 0, offset: r3(Math.max(0, t)), ratio };
}

export function timeFor(a: Anchor, p: Places): number {
  const fallback = a.ratio * p.duration;
  let t: number;
  if (a.on === "payoff") t = (p.payoff ?? fallback) + a.offset;
  else if (a.on === "cut") t = p.cuts[a.index] != null ? p.cuts[a.index]! + a.offset : fallback;
  else if (a.on === "beat") t = p.beats[a.index] != null ? p.beats[a.index]! + a.offset : fallback;
  else if (a.on === "end") t = p.duration - a.offset;
  else t = a.offset;
  return r3(Math.max(0, Math.min(Math.max(0, p.duration - 0.1), t)));
}

export function anchorWords(a: Anchor): string {
  const off = a.offset ? ` ${a.offset > 0 ? "+" : ""}${a.offset.toFixed(1)} s` : "";
  if (a.on === "payoff") return `at the payoff${off}`;
  if (a.on === "cut") return `on cut ${a.index + 1}${off}`;
  if (a.on === "beat") return `on beat ${a.index + 1}${off}`;
  if (a.on === "end") return `${a.offset.toFixed(1)} s from the end`;
  return `at ${a.offset.toFixed(1)} s`;
}
