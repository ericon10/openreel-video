import React, { useState } from "react";
import { PRESETS, type PresetCategory, type PresetStrength } from "@openreel/core/studio";
import { useTimelineStore } from "../../stores/timeline-store";
import { applyPreset, playhead } from "./actions";
import { nearBeat } from "./beat";
import { BeatCard, StylesCard } from "./StudioCards";
import { usePresetUi } from "./state";

// The Presets panel (Character Studio embed): the edit library as moving
// thumbnails with one line each. A click drops the preset at the playhead
// (a transition snaps to the nearest cut, a moment to a beat close by);
// the Studio's suggested spots move the playhead there in one click.
// Nothing is placed without a click. Beat and Styles sit above the library.

const GROUPS: Array<[PresetCategory, string]> = [
  ["transition", "Transitions (on a cut)"],
  ["moment", "Moments (at the playhead)"],
  ["text", "Text (on the caption)"],
  ["caption", "Caption looks"],
  ["layout", "Layouts"],
];
const STRENGTHS: PresetStrength[] = ["subtle", "normal", "strong"];
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const StudioPresetsPanel: React.FC = () => {
  const { strength, setStrength, status, say, busy, setBusy, spots, select } = usePresetUi();
  const setPlayhead = useTimelineStore((s) => s.setPlayheadPosition);
  const position = useTimelineStore((s) => s.playheadPosition);
  const [open, setOpen] = useState<PresetCategory | null>(null);

  async function place(id: string) {
    setBusy(id);
    say(null);
    // On a beat when the playhead is just off one (a transition finds its cut).
    const r = await applyPreset(id, strength, nearBeat(playhead()));
    setBusy(null);
    say({ tone: r.ok ? "ok" : "bad", text: r.message });
    if (r.layerId) select(r.layerId);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-text-primary" data-studio="presets">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Strength">
        {STRENGTHS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={strength === s} onClick={() => setStrength(s)}
            className={`rounded-md border px-2.5 py-1 text-xs ${strength === s ? "border-primary bg-primary/10 font-semibold text-text-primary" : "border-border text-text-secondary hover:text-text-primary"}`}>
            {label(s)}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-text-secondary">At {position.toFixed(2)} s</span>
      </div>

      {spots.length > 0 && (
        <div className="rounded-lg border border-border p-2">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Suggested spots</div>
          <div className="flex flex-wrap gap-1.5">
            {spots.map((s) => (
              <button key={`${s.label}-${s.time}`} type="button" title={s.why} onClick={() => setPlayhead(s.time)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary/60">
                {s.label} · {s.time.toFixed(1)} s
              </button>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-text-secondary">One click moves the playhead there; then pick a preset.</div>
        </div>
      )}

      {status && (
        <div role="status" className={`rounded-md px-2 py-1.5 text-xs ${status.tone === "ok" ? "bg-primary/10 text-text-primary" : "bg-red-500/10 text-red-400"}`}>{status.text}</div>
      )}

      <BeatCard />
      <StylesCard />

      {GROUPS.map(([cat, title]) => {
        const list = PRESETS.filter((p) => p.category === cat);
        const shown = open === null || open === cat ? list : list.slice(0, 2);
        return (
          <section key={cat} className="flex flex-col gap-2">
            <button type="button" className="flex items-center text-left text-xs font-semibold text-text-secondary" onClick={() => setOpen(open === cat ? null : cat)}>
              {title}<span className="ml-auto text-[11px] font-normal">{list.length}</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              {shown.map((p) => (
                <button key={p.id} type="button" disabled={!!busy} onClick={() => void place(p.id)} title={p.line}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary/60 disabled:opacity-60">
                  <img src={`/studio-edits/${p.thumb}.webp`} alt="" loading="lazy" className="aspect-[9/16] w-full bg-black object-cover" />
                  <span className="px-2 pt-1.5 text-xs font-semibold leading-tight">{busy === p.id ? "Placing..." : p.label}</span>
                  <span className="px-2 pb-2 pt-0.5 text-[11px] leading-snug text-text-secondary">{p.line}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
