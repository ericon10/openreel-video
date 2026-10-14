import React, { useEffect } from "react";
import { presetById, type CameraKey, type PresetEase, type PresetStrength } from "@openreel/core/studio";
import { useProjectStore } from "../../stores/project-store";
import { useTimelineStore } from "../../stores/timeline-store";
import { removePresetLayer, updatePresetLayer } from "./actions";
import { usePresetUi } from "./state";

// The selected preset's panel (Character Studio embed): Subtle, Normal or
// Strong, where it starts and how long it runs, and its keyframes (time
// across the block, then each value), all editable; Reset brings back the
// preset's own keys. Delete or Backspace removes it.

type Channel = Exclude<keyof CameraKey, "t" | "ease">;
const CHANNELS: Array<[Channel, string, number]> = [
  ["scale", "Zoom", 0.01], ["x", "Move X", 0.01], ["y", "Move Y", 0.01], ["rotation", "Rotate", 1], ["blur", "Blur", 1],
  ["motionBlur", "Streak", 0.05], ["rgb", "RGB split", 1], ["shake", "Shake", 0.005], ["flash", "Flash", 0.05], ["dark", "Dark", 0.05],
  ["saturation", "Colour", 0.05], ["brightness", "Bright", 0.05], ["vignette", "Vignette", 0.05],
];
const EASES: PresetEase[] = ["linear", "in", "out", "inOut", "inExpo", "outExpo", "outBack", "hold"];
const STRENGTHS: PresetStrength[] = ["subtle", "normal", "strong"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const PresetInspector: React.FC = () => {
  const selected = usePresetUi((s) => s.selected);
  const select = usePresetUi((s) => s.select);
  const layer = useProjectStore((s) => (s.project.adjustmentLayers ?? []).find((l) => l.id === selected && l.studio));
  const playhead = useTimelineStore((s) => s.playheadPosition);

  useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); void removePresetLayer(layer.id); select(null); }
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [layer, select]);

  if (!layer?.studio) return null;
  const data = layer.studio;
  const def = presetById(data.preset);
  const keys = [...data.keys].sort((a, b) => a.t - b.t);
  const used = CHANNELS.filter(([ch]) => keys.some((k) => k[ch] !== undefined));
  const setKeys = (next: CameraKey[]) => void updatePresetLayer(layer.id, { keys: next });
  const setKey = (i: number, patch: Partial<CameraKey>) => setKeys(keys.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  const inBlock = playhead >= layer.startTime && playhead <= layer.startTime + layer.duration;
  const tAtPlayhead = Math.round(((playhead - layer.startTime) / layer.duration) * 100) / 100;

  return (
    <div className="fixed bottom-4 right-4 z-[9998] w-[360px] max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg-1 p-3 text-text-primary shadow-2xl" role="dialog" aria-label={`${layer.name} preset`}>
      <div className="mb-2 flex items-center gap-2">
        <b className="text-sm">{layer.name}</b>
        <span className="text-[11px] text-text-secondary">{def?.line}</span>
        <button type="button" className="ml-auto text-xs text-text-secondary hover:text-text-primary" onClick={() => select(null)} aria-label="Close">Close</button>
      </div>
      <div className="mb-2 flex gap-1">
        {STRENGTHS.map((s) => (
          <button key={s} type="button" onClick={() => void updatePresetLayer(layer.id, { strength: s })}
            className={`rounded-md border px-2.5 py-1 text-xs ${data.strength === s ? "border-primary bg-primary/10 font-semibold" : "border-border text-text-secondary"}`}>{cap(s)}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">Starts (s)
          <input type="number" step={0.05} min={0} value={Math.round(layer.startTime * 100) / 100} onChange={(e) => void updatePresetLayer(layer.id, { startTime: Number(e.target.value) })} className="rounded border border-border bg-transparent px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">Length (s)
          <input type="number" step={0.05} min={0.1} value={Math.round(layer.duration * 100) / 100} onChange={(e) => void updatePresetLayer(layer.id, { duration: Number(e.target.value) })} className="rounded border border-border bg-transparent px-2 py-1" />
        </label>
      </div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Keyframes</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="text-text-secondary"><th className="pr-1 text-left">At %</th>{used.map(([, l]) => <th key={l} className="px-1 text-left">{l}</th>)}<th className="px-1 text-left">Ease</th><th /></tr></thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={i}>
                <td className="pr-1"><input type="number" min={0} max={100} step={1} value={Math.round(k.t * 100)} onChange={(e) => setKey(i, { t: Math.max(0, Math.min(1, Number(e.target.value) / 100)) })} className="w-12 rounded border border-border bg-transparent px-1" /></td>
                {used.map(([ch, , step]) => (
                  <td key={ch} className="px-1"><input type="number" step={step} value={k[ch] ?? ""} placeholder="same" onChange={(e) => setKey(i, { [ch]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<CameraKey>)} className="w-14 rounded border border-border bg-transparent px-1" /></td>
                ))}
                <td className="px-1"><select value={k.ease ?? "linear"} onChange={(e) => setKey(i, { ease: e.target.value as PresetEase })} className="rounded border border-border bg-transparent">{EASES.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                <td><button type="button" className="text-text-secondary hover:text-red-400" aria-label="Remove keyframe" onClick={() => setKeys(keys.filter((_, j) => j !== i))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={!inBlock} className="rounded-md border border-border px-2 py-1 disabled:opacity-50" title={inBlock ? undefined : "Move the playhead inside the block"}
          onClick={() => { const at = keys.filter((k) => k.t <= tAtPlayhead).pop() ?? keys[0]; setKeys([...keys, { ...(at ?? {}), t: tAtPlayhead }]); }}>
          Add keyframe at the playhead
        </button>
        {def?.keys && <button type="button" className="rounded-md border border-border px-2 py-1" onClick={() => setKeys([...def.keys!])}>Reset</button>}
        <button type="button" className="ml-auto rounded-md border border-red-400/50 px-2 py-1 text-red-400" onClick={() => { void removePresetLayer(layer.id); select(null); }}>Delete</button>
      </div>
    </div>
  );
};
