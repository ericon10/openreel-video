// Character Studio presets (fork only). A preset is an edit the owner drops
// on the timeline at the playhead: a block with handles that can be dragged,
// trimmed and set Subtle, Normal or Strong, whose keyframes stay editable.
// Camera presets (zooms, pans, shakes, flashes, glitches) are adjustment
// layers carrying `studio` data and drawn over everything below them; time,
// text, caption and layout presets change the clips and captions they land
// on. Everything here is plain data and pure math with no browser or
// OpenReel imports, so the Studio's worker carries an identical copy and a
// render matches the editor.

export type PresetCategory = "transition" | "moment" | "text" | "caption" | "layout";
export type PresetKind = "camera" | "time" | "text" | "caption" | "layout";
export type PresetStrength = "subtle" | "normal" | "strong";
export type PresetEase = "linear" | "in" | "out" | "inOut" | "inExpo" | "outExpo" | "outBack" | "hold";

// One keyframe of a camera preset. `t` is 0 to 1 across the block, so a
// trimmed block keeps its shape. Values are absolute; anything left out
// keeps the previous key's value. Amplitudes are scaled by the strength.
export interface CameraKey {
  readonly t: number;
  readonly scale?: number;      // 1 = as shot
  readonly x?: number;          // shift, fraction of the frame width
  readonly y?: number;          // shift, fraction of the frame height
  readonly rotation?: number;   // degrees
  readonly blur?: number;       // px at 1080 wide
  readonly motionBlur?: number; // 0 to 1, a streak along the motion
  readonly rgb?: number;        // RGB split, px at 1080 wide
  readonly flash?: number;      // white over the frame, 0 to 1
  readonly dark?: number;       // black over the frame, 0 to 1 (a hand over the lens)
  readonly shake?: number;      // jitter, fraction of the frame
  readonly saturation?: number; // 1 = as shot
  readonly brightness?: number; // 1 = as shot
  readonly vignette?: number;   // 0 to 1
  readonly ease?: PresetEase;   // how the move INTO this key goes
}

export interface CameraFrame {
  scale: number; x: number; y: number; rotation: number; blur: number; motionBlur: number; rgb: number;
  flash: number; dark: number; shake: number; saturation: number; brightness: number; vignette: number;
}

// What a camera block carries on its adjustment layer.
export interface StudioPresetData {
  readonly version: 1;
  readonly preset: string;
  readonly strength: PresetStrength;
  readonly keys: readonly CameraKey[];
}

export interface PresetDef {
  readonly id: string;
  readonly label: string;
  readonly line: string;
  readonly category: PresetCategory;
  readonly kind: PresetKind;
  // Seconds; a transition sits centered on the nearest cut.
  readonly duration: number;
  readonly anchor: "playhead" | "cut";
  // Needs a second shot (the Video step's shot B) or B-roll.
  readonly needs?: "shotB" | "background";
  // The moving thumbnail (served by the Studio at /studio-edits/<thumb>.webp).
  readonly thumb: string;
  readonly keys?: readonly CameraKey[];
  // Time presets: the clip's speed across the block (1 = as shot), or a
  // freeze, or playing it backwards.
  readonly speed?: readonly { t: number; speed: number }[];
  readonly freeze?: boolean;
  readonly reverse?: boolean;
  // Text presets: how the caption under the playhead animates.
  readonly textStyle?: "karaoke" | "word-by-word" | "slam" | "behind";
  // Caption looks.
  readonly look?: "box" | "outline";
  // Layouts.
  readonly layout?: "split" | "pip" | "greenscreen";
}

export const STRENGTH_SCALE: Record<PresetStrength, number> = { subtle: 0.55, normal: 1, strong: 1.6 };

const k = (t: number, v: Omit<CameraKey, "t">): CameraKey => ({ t, ...v });

export const PRESETS: readonly PresetDef[] = [
  // Transitions: centered on the cut between two shots.
  { id: "crash_zoom", label: "Crash zoom cut", line: "Slams into the face and cuts hard to the next shot.", category: "transition", kind: "camera", duration: 0.6, anchor: "cut", needs: "shotB", thumb: "crash_zoom",
    keys: [k(0, { scale: 1, motionBlur: 0 }), k(0.48, { scale: 1.9, motionBlur: 0.7, ease: "inExpo" }), k(0.5, { scale: 1.35, motionBlur: 0.3, ease: "hold" }), k(1, { scale: 1, motionBlur: 0, ease: "outExpo" })] },
  { id: "whip_pan", label: "Whip pan", line: "A fast blurred pan carries one shot into the next.", category: "transition", kind: "camera", duration: 0.5, anchor: "cut", needs: "shotB", thumb: "whip_pan",
    keys: [k(0, { x: 0, motionBlur: 0 }), k(0.5, { x: -0.55, motionBlur: 1, ease: "inExpo" }), k(0.5001, { x: 0.55, motionBlur: 1, ease: "hold" }), k(1, { x: 0, motionBlur: 0, ease: "outExpo" })] },
  { id: "zoom_through", label: "Zoom-through", line: "Pushes through the frame into the next shot.", category: "transition", kind: "camera", duration: 0.6, anchor: "cut", needs: "shotB", thumb: "zoom_reveal",
    keys: [k(0, { scale: 1, blur: 0 }), k(0.5, { scale: 2.8, blur: 10, ease: "inExpo" }), k(0.5001, { scale: 0.75, blur: 10, ease: "hold" }), k(1, { scale: 1, blur: 0, ease: "outExpo" })] },
  { id: "spin", label: "Spin", line: "Zooms and rotates out of one shot and into the next.", category: "transition", kind: "camera", duration: 0.7, anchor: "cut", needs: "shotB", thumb: "spin",
    keys: [k(0, { scale: 1, rotation: 0, blur: 0 }), k(0.5, { scale: 1.6, rotation: 180, blur: 8, ease: "inExpo" }), k(1, { scale: 1, rotation: 360, blur: 0, ease: "outExpo" })] },
  { id: "glitch", label: "Glitch / RGB split", line: "A digital stutter with split colour channels over the cut.", category: "transition", kind: "camera", duration: 0.5, anchor: "cut", thumb: "glitch",
    keys: [k(0, { rgb: 0, shake: 0 }), k(0.3, { rgb: 16, shake: 0.02 }), k(0.5, { rgb: 28, shake: 0.035 }), k(0.7, { rgb: 14, shake: 0.02 }), k(1, { rgb: 0, shake: 0 })] },
  { id: "flash_cut", label: "Flash cut", line: "A white flash right on the cut.", category: "transition", kind: "camera", duration: 0.4, anchor: "cut", thumb: "flash_shake",
    keys: [k(0, { flash: 0 }), k(0.5, { flash: 0.95, ease: "in" }), k(1, { flash: 0, ease: "out" })] },
  { id: "hand_lens", label: "Hand over lens", line: "The frame goes dark as if a hand covers the lens, then opens on the next shot.", category: "transition", kind: "camera", duration: 0.7, anchor: "cut", needs: "shotB", thumb: "hand_lens",
    keys: [k(0, { dark: 0, scale: 1 }), k(0.42, { dark: 1, scale: 1.12, ease: "in" }), k(0.58, { dark: 1, scale: 1.12, ease: "hold" }), k(1, { dark: 0, scale: 1, ease: "out" })] },
  { id: "match_cut", label: "Match cut", line: "A tiny punch and flash so two matching shots read as one move.", category: "transition", kind: "camera", duration: 0.3, anchor: "cut", needs: "shotB", thumb: "punch_in",
    keys: [k(0, { scale: 1.06, flash: 0 }), k(0.5, { scale: 1.06, flash: 0.35, ease: "hold" }), k(1, { scale: 1, flash: 0, ease: "out" })] },
  // Moments: at the playhead.
  { id: "speed_ramp", label: "Speed ramp", line: "Eases from full speed into slow motion for the moment.", category: "moment", kind: "time", duration: 1.6, anchor: "playhead", thumb: "speed_ramp",
    speed: [{ t: 0, speed: 1 }, { t: 0.3, speed: 0.35 }, { t: 1, speed: 0.35 }] },
  { id: "velocity", label: "Velocity edit", line: "Fast, then slow on the moment, then fast again.", category: "moment", kind: "time", duration: 1.8, anchor: "playhead", thumb: "velocity",
    speed: [{ t: 0, speed: 2.2 }, { t: 0.35, speed: 0.35 }, { t: 0.65, speed: 0.35 }, { t: 1, speed: 2.2 }] },
  { id: "snap_zoom", label: "Snap zoom", line: "Snaps in tight and holds.", category: "moment", kind: "camera", duration: 1.2, anchor: "playhead", thumb: "snap_zoom",
    keys: [k(0, { scale: 1 }), k(0.1, { scale: 1.4, ease: "outExpo" }), k(1, { scale: 1.4, ease: "hold" })] },
  { id: "punch_in", label: "Punch-in on beat", line: "A quick push-in that lands on the beat.", category: "moment", kind: "camera", duration: 0.8, anchor: "playhead", thumb: "punch_in",
    keys: [k(0, { scale: 1 }), k(0.12, { scale: 1.18, ease: "outBack" }), k(1, { scale: 1.18, ease: "hold" })] },
  { id: "shake", label: "Impact shake", line: "A short hard shake that dies away.", category: "moment", kind: "camera", duration: 0.5, anchor: "playhead", thumb: "flash_shake",
    keys: [k(0, { shake: 0.035, scale: 1.04 }), k(1, { shake: 0, scale: 1, ease: "out" })] },
  { id: "freeze_pop", label: "Freeze frame", line: "Holds the frame for a beat (add a text pop or the record scratch).", category: "moment", kind: "time", duration: 1.2, anchor: "playhead", thumb: "freeze_pop", freeze: true },
  { id: "record_scratch", label: "Freeze + record scratch", line: "The classic \"yep, that's me\" freeze with a desaturated hold.", category: "moment", kind: "time", duration: 1.5, anchor: "playhead", thumb: "record_scratch", freeze: true },
  { id: "dolly_zoom", label: "Dolly zoom", line: "A slow push with the edges pulling away, the vertigo look.", category: "moment", kind: "camera", duration: 2, anchor: "playhead", thumb: "dolly_zoom",
    keys: [k(0, { scale: 1, vignette: 0 }), k(1, { scale: 1.28, vignette: 0.45, ease: "inOut" })] },
  { id: "push_in", label: "Slow push", line: "A slow, steady push toward her.", category: "moment", kind: "camera", duration: 3, anchor: "playhead", thumb: "punch_in",
    keys: [k(0, { scale: 1 }), k(1, { scale: 1.12, ease: "inOut" })] },
  { id: "pull_out", label: "Slow pull", line: "A slow pull back to reveal more.", category: "moment", kind: "camera", duration: 3, anchor: "playhead", thumb: "zoom_reveal",
    keys: [k(0, { scale: 1.12 }), k(1, { scale: 1, ease: "inOut" })] },
  { id: "rewind", label: "Rewind", line: "Plays the moment backwards with a VHS wobble.", category: "moment", kind: "time", duration: 1, anchor: "playhead", thumb: "glitch", reverse: true },
  // Text: on the caption under the playhead.
  { id: "karaoke", label: "Karaoke captions", line: "Each word lights up as it is said.", category: "text", kind: "text", duration: 0, anchor: "playhead", thumb: "karaoke", textStyle: "karaoke" },
  { id: "word_pop", label: "Word-by-word pop", line: "The caption pops in one word at a time.", category: "text", kind: "text", duration: 0, anchor: "playhead", thumb: "word_pop", textStyle: "word-by-word" },
  { id: "caption_slam", label: "Caption slam", line: "The caption slams in big and settles.", category: "text", kind: "text", duration: 0, anchor: "playhead", thumb: "freeze_pop", textStyle: "slam" },
  { id: "text_behind", label: "Text behind subject", line: "The caption sits behind her, cut out from the shot.", category: "text", kind: "text", duration: 0, anchor: "playhead", thumb: "text_behind", textStyle: "behind" },
  // Caption looks (all captions; upper third, clear of TikTok's buttons).
  { id: "look_box", label: "White box", line: "Black text on a white box, TikTok style.", category: "caption", kind: "caption", duration: 0, anchor: "playhead", thumb: "word_pop", look: "box" },
  { id: "look_outline", label: "Outline (TikTok Classic)", line: "White text with a black stroke.", category: "caption", kind: "caption", duration: 0, anchor: "playhead", thumb: "karaoke", look: "outline" },
  // Layouts.
  { id: "split_screen", label: "Split screen / duet", line: "Two shots stacked, playing together.", category: "layout", kind: "layout", duration: 0, anchor: "playhead", needs: "shotB", thumb: "split_screen", layout: "split" },
  { id: "pip", label: "Picture-in-picture", line: "A second shot small in the corner.", category: "layout", kind: "layout", duration: 0, anchor: "playhead", needs: "shotB", thumb: "split_screen", layout: "pip" },
  { id: "green_screen", label: "Green-screen reaction", line: "Her, cut out, over the B-roll or a screenshot.", category: "layout", kind: "layout", duration: 0, anchor: "playhead", needs: "background", thumb: "green_screen", layout: "greenscreen" },
];

export const presetById = (id: string): PresetDef | undefined => PRESETS.find((p) => p.id === id);

// ── Evaluation (pure; the Studio's worker uses the same) ──

export const IDENTITY: CameraFrame = { scale: 1, x: 0, y: 0, rotation: 0, blur: 0, motionBlur: 0, rgb: 0, flash: 0, dark: 0, shake: 0, saturation: 1, brightness: 1, vignette: 0 };
const CHANNELS = Object.keys(IDENTITY) as (keyof CameraFrame)[];

export function ease(name: PresetEase | undefined, u: number): number {
  const x = Math.max(0, Math.min(1, u));
  switch (name) {
    case "in": return x * x * x;
    case "out": return 1 - Math.pow(1 - x, 3);
    case "inOut": return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "inExpo": return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
    case "outExpo": return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
    case "outBack": { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
    case "hold": return x < 1 ? 0 : 1;
    default: return x;
  }
}

// Scales a value's distance from "as shot" by the strength.
function amplify(channel: keyof CameraFrame, value: number, s: number): number {
  const base = IDENTITY[channel];
  return base + (value - base) * s;
}

// Each channel's value at `u` (0 to 1 across the block): the keys that set
// it, eased between them, held before the first and after the last.
export function cameraAt(keys: readonly CameraKey[], u: number, strength: PresetStrength = "normal"): CameraFrame {
  const s = STRENGTH_SCALE[strength];
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const out: CameraFrame = { ...IDENTITY };
  for (const ch of CHANNELS) {
    const pts = sorted.filter((key) => key[ch as keyof CameraKey] !== undefined);
    if (!pts.length) continue;
    const val = (key: CameraKey) => key[ch as keyof CameraKey] as number;
    let v: number;
    if (u <= pts[0]!.t) v = val(pts[0]!);
    else if (u >= pts[pts.length - 1]!.t) v = val(pts[pts.length - 1]!);
    else {
      let i = 0;
      while (i < pts.length - 1 && pts[i + 1]!.t < u) i++;
      const a = pts[i]!, b = pts[i + 1]!;
      const span = b.t - a.t;
      const local = span > 0 ? (u - a.t) / span : 1;
      v = val(a) + (val(b) - val(a)) * ease(b.ease, local);
    }
    out[ch] = amplify(ch, v, s);
  }
  out.flash = Math.max(0, Math.min(1, out.flash));
  out.dark = Math.max(0, Math.min(1, out.dark));
  out.motionBlur = Math.max(0, Math.min(1.5, out.motionBlur));
  out.vignette = Math.max(0, Math.min(1, out.vignette));
  out.scale = Math.max(0.2, out.scale);
  return out;
}

// A small deterministic jitter (the same frame always shakes the same way).
export function shakeOffset(time: number, amount: number): { dx: number; dy: number; rot: number } {
  if (amount <= 0) return { dx: 0, dy: 0, rot: 0 };
  const n = (f: number, p: number) => Math.sin(time * f + p) * 0.6 + Math.sin(time * f * 2.3 + p * 1.7) * 0.4;
  return { dx: n(61, 0.3) * amount, dy: n(53, 1.9) * amount, rot: n(47, 4.1) * amount * 40 };
}

// The speed across a time preset's block at `u`, linear between points.
export function speedAt(points: readonly { t: number; speed: number }[], u: number): number {
  const pts = [...points].sort((a, b) => a.t - b.t);
  if (!pts.length) return 1;
  if (u <= pts[0]!.t) return pts[0]!.speed;
  if (u >= pts[pts.length - 1]!.t) return pts[pts.length - 1]!.speed;
  let i = 0;
  while (i < pts.length - 1 && pts[i + 1]!.t < u) i++;
  const a = pts[i]!, b = pts[i + 1]!;
  return a.speed + (b.speed - a.speed) * ((u - a.t) / Math.max(1e-6, b.t - a.t));
}

export function presetData(def: PresetDef, strength: PresetStrength = "normal"): StudioPresetData {
  return { version: 1, preset: def.id, strength, keys: def.keys ?? [] };
}
