import type { PresetStrength } from "@openreel/core/studio";

// Presets that change clips and captions rather than adding a block (time,
// text, caption looks, layouts) leave no block on the Presets track, so the
// embed keeps a short list of where they were placed. "Save as a style"
// reads it with the blocks; it is saved with the project (`studioApplied`).

export interface AppliedPreset { preset: string; strength: PresetStrength; at: number }

let applied: AppliedPreset[] = [];

export const appliedPresets = (): AppliedPreset[] => [...applied];
export function logApplied(p: AppliedPreset): void {
  // A caption look or a text style replaces the earlier one of its kind.
  applied = [...applied.filter((x) => !(x.preset === p.preset && Math.abs(x.at - p.at) < 0.05)), p];
}
export function restoreApplied(list: readonly AppliedPreset[] | undefined): void {
  applied = [...(list ?? [])];
}
export function clearApplied(): void { applied = []; }
