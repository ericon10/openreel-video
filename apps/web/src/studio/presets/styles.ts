import { anchorFor, presetById, timeFor, type CameraKey, type Places, type SavedStyle, type StyleItem } from "@openreel/core/studio";
import { useProjectStore } from "../../stores/project-store";
import { applyPreset, cuts, presetLayers, updatePresetLayer } from "./actions";
import { beatTimes } from "./beat";
import { appliedPresets } from "./log";
import { usePresetUi } from "./state";

// Saved styles (Character Studio embed): the timeline's presets as a stack
// with relative places ("at the payoff", "on cut 1", "on beat 8"), saved
// to the owner's account, and placed again on any post. "Make another like
// this" in the Studio carries the post's stack to the copy, which places it
// on first open.

const store = () => useProjectStore.getState();

export function places(): Places {
  const p = store().project;
  // The payoff marker, else the Studio's suggested spot.
  const payoff = p.timeline.markers.find((m) => /payoff/i.test(m.label ?? ""))?.time
    ?? usePresetUi.getState().spots.find((x) => /payoff/i.test(x.label))?.time ?? null;
  return { duration: Math.max(0.1, p.timeline.duration || 0), payoff, cuts: cuts(), beats: beatTimes() };
}

const sameKeys = (a: readonly CameraKey[], b: readonly CameraKey[]) => JSON.stringify(a) === JSON.stringify(b);

// The open timeline's presets, in time order.
export function currentStack(): StyleItem[] {
  const at = places();
  const items: Array<StyleItem & { t: number }> = [];
  for (const l of presetLayers()) {
    const def = l.studio ? presetById(l.studio.preset) : undefined;
    // Blocks made by a time preset (the record scratch hold, the rewind
    // hit) come back with that preset.
    if (!def || !l.studio || def.kind !== "camera") continue;
    // A transition is placed by its centre (the cut); others by their start.
    const t = def.anchor === "cut" ? l.startTime + l.duration / 2 : l.startTime;
    items.push({
      t, preset: def.id, strength: l.studio.strength, at: anchorFor(t, at),
      duration: Math.abs(l.duration - def.duration) > 0.01 ? Math.round(l.duration * 1000) / 1000 : null,
      keys: def.keys && !sameKeys(l.studio.keys, def.keys) ? [...l.studio.keys] : null,
    });
  }
  for (const a of appliedPresets()) {
    if (!presetById(a.preset)) continue;
    items.push({ t: a.at, preset: a.preset, strength: a.strength, at: anchorFor(a.at, at), duration: null, keys: null });
  }
  return items.sort((x, y) => x.t - y.t).map(({ t: _t, ...rest }) => rest);
}

export async function applyStack(items: readonly StyleItem[]): Promise<{ placed: number; problems: string[] }> {
  const at = places();
  let placed = 0;
  const problems: string[] = [];
  for (const it of items) {
    const r = await applyPreset(it.preset, it.strength, timeFor(it.at, at));
    if (!r.ok) { problems.push(r.message); continue; }
    placed++;
    if (r.layerId && (it.duration != null || it.keys)) {
      await updatePresetLayer(r.layerId, { ...(it.duration != null ? { duration: it.duration } : {}), ...(it.keys ? { keys: it.keys } : {}) });
    }
  }
  return { placed, problems };
}

// The account's saved styles live in the Studio.
let api = "/api/v1";
export const setStylesApi = (base: string): void => { api = base; };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${api}${path}`, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", "x-studio-request": "1", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(body.error?.message || `The Studio answered ${res.status}.`);
  return body;
}

export const saveStyle = (name: string, items: StyleItem[]) => call<SavedStyle>("/editor/styles", { method: "POST", body: JSON.stringify({ name, items }) });
export const deleteStyle = (id: string) => call<{ ok: true }>(`/editor/styles/${encodeURIComponent(id)}`, { method: "DELETE" });
