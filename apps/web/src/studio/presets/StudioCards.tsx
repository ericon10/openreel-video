import React, { useEffect, useRef, useState } from "react";
import { anchorWords, presetById, type SavedStyle } from "@openreel/core/studio";
import { getBeatSyncBridge, type BeatSyncState } from "../../bridges/beat-sync-bridge";
import { useProjectStore } from "../../stores/project-store";
import { addMusicFile, clearBeats, findBeatsInMusic, getMusicInExport, musicClips, setGrid, setMusicInExport, tempoFromTaps } from "./beat";
import { usePresetUi } from "./state";
import { applyStack, currentStack, deleteStyle, saveStyle } from "./styles";

// Two cards at the top of the Presets tab (Character Studio embed): Beat
// (find the beat in the music, tap the tempo or type it, music in the
// export or not) and Styles (save this timeline's presets as a style,
// place a saved style). Every button says what it is doing and what
// happened.

const card = "rounded-lg border border-border p-2";
const head = "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary";
const small = "rounded-md border border-border px-2 py-1 text-xs hover:border-primary/60 disabled:opacity-50";

function useBeatState(): BeatSyncState {
  const [s, set] = useState<BeatSyncState>(() => getBeatSyncBridge().getState());
  useEffect(() => getBeatSyncBridge().subscribe(set), []);
  return s;
}

export const BeatCard: React.FC = () => {
  const beat = useBeatState();
  const say = usePresetUi((s) => s.say);
  // Re-render when clips change (music added or removed).
  useProjectStore((s) => s.project.timeline.tracks);
  const hasMusic = musicClips().length > 0;
  const [busy, setBusy] = useState<string | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [bpm, setBpm] = useState("");
  const [inExport, setInExport] = useState(getMusicInExport());
  const file = useRef<HTMLInputElement>(null);
  const tapped = tempoFromTaps(taps);

  async function run(what: string, fn: () => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string }) {
    setBusy(what);
    say(null);
    const r = await fn();
    setBusy(null);
    say({ tone: r.ok ? "ok" : "bad", text: r.message });
  }

  return (
    <div className={card} data-studio="beat">
      <div className={head}>Beat</div>
      <div className="mb-1.5 text-[11px] text-text-secondary" role="status">
        {beat.isAnalyzing ? "Listening for the beat..." : beat.beatMarkers.length
          ? `${beat.beatMarkers.length} beats${beat.beatAnalysis?.bpm ? ` at ${beat.beatAnalysis.bpm} BPM` : ""}. Clips and presets snap to them.`
          : "No beat yet. Find it in the music, or tap the tempo."}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {hasMusic && (
          <button type="button" className={small} disabled={!!busy} onClick={() => void run("find", findBeatsInMusic)}>
            {busy === "find" ? "Listening..." : "Find the beat in the music"}
          </button>
        )}
        <button type="button" className={small} disabled={!!busy} onClick={() => file.current?.click()}>
          {busy === "add" ? "Adding the music..." : hasMusic ? "Add another track" : "Add music"}
        </button>
        <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void run("add", () => addMusicFile(f));
        }} />
        {beat.beatMarkers.length > 0 && <button type="button" className={small} disabled={!!busy} onClick={() => { clearBeats(); say({ tone: "ok", text: "Beats cleared." }); }}>Clear</button>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className={small} onClick={() => setTaps((t) => [...t, performance.now()])} title="Tap along with the music, at least 4 times">
          Tap{taps.length ? ` (${taps.length})` : ""}
        </button>
        {tapped && (
          <button type="button" className={`${small} border-primary/60`} onClick={() => { setTaps([]); void run("grid", () => setGrid(tapped, "tap")); }}>
            Use {tapped} BPM from the playhead
          </button>
        )}
        <input aria-label="Tempo in BPM" inputMode="numeric" placeholder="BPM" value={bpm} onChange={(e) => setBpm(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          className="w-14 rounded-md border border-border bg-transparent px-1.5 py-1 text-xs" />
        <button type="button" className={small} disabled={!bpm} title={bpm ? undefined : "Type a tempo first"} onClick={() => void run("grid", () => setGrid(Number(bpm), "bpm"))}>Set</button>
      </div>
      {hasMusic && (
        <label className="mt-1.5 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={inExport} onChange={(e) => { setMusicInExport(e.target.checked); setInExport(e.target.checked); }} />
          Music in the export
          <span className="text-[11px] text-text-secondary">(off when you add the TikTok sound in the app)</span>
        </label>
      )}
    </div>
  );
};

const summary = (s: SavedStyle) => s.items.map((i) => `${presetById(i.preset)?.label ?? i.preset} ${anchorWords(i.at)}`).join(", ");

export const StylesCard: React.FC = () => {
  const styles = usePresetUi((s) => s.styles);
  const setStyles = usePresetUi((s) => s.setStyles);
  const say = usePresetUi((s) => s.say);
  // Re-render as presets come and go (each placement sets a status line).
  useProjectStore((s) => s.project.adjustmentLayers);
  usePresetUi((s) => s.status);
  const stack = currentStack();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function save() {
    setBusy("save");
    say(null);
    try {
      const saved = await saveStyle(name.trim(), stack);
      setStyles([...styles.filter((x) => x.name.toLowerCase() !== saved.name.toLowerCase()), saved]);
      say({ tone: "ok", text: `Saved "${saved.name}": ${summary(saved)}.` });
      setNaming(false);
      setName("");
    } catch (e) {
      say({ tone: "bad", text: (e as Error).message });
    }
    setBusy(null);
  }

  async function place(s: SavedStyle) {
    setBusy(s.id);
    say(null);
    const r = await applyStack(s.items);
    setBusy(null);
    say({ tone: r.problems.length && !r.placed ? "bad" : "ok", text: `${s.name}: ${r.placed} of ${s.items.length} placed.${r.problems.length ? ` ${r.problems[0]}` : " Drag or trim any of them."}` });
  }

  async function remove(s: SavedStyle) {
    setBusy(`del-${s.id}`);
    try {
      await deleteStyle(s.id);
      setStyles(styles.filter((x) => x.id !== s.id));
      say({ tone: "ok", text: `Deleted "${s.name}".` });
    } catch (e) {
      say({ tone: "bad", text: (e as Error).message });
    }
    setBusy(null);
  }

  return (
    <div className={card} data-studio="styles">
      <div className={head}>Styles</div>
      {styles.length === 0 && <div className="mb-1.5 text-[11px] text-text-secondary">Save the presets on this timeline as a style, then place it on any post in one click.</div>}
      <div className="flex flex-col gap-1">
        {styles.map((s) => (
          <div key={s.id} className="flex items-start gap-1.5">
            <button type="button" className={`${small} min-w-0 flex-1 text-left`} disabled={!!busy} onClick={() => void place(s)} title={summary(s)}>
              <span className="block truncate font-semibold">{busy === s.id ? "Placing..." : s.name}</span>
              <span className="block truncate text-[11px] text-text-secondary">{summary(s)}</span>
            </button>
            <button type="button" aria-label={`Delete ${s.name}`} className="px-1 text-text-secondary hover:text-red-400" disabled={!!busy} onClick={() => void remove(s)}>
              {busy === `del-${s.id}` ? "..." : "×"}
            </button>
          </div>
        ))}
      </div>
      {naming ? (
        <div className="mt-1.5 flex gap-1.5">
          <input autoFocus aria-label="Style name" value={name} maxLength={60} placeholder="Name, e.g. Payoff zoom" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void save(); if (e.key === "Escape") setNaming(false); }}
            className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-1.5 py-1 text-xs" />
          <button type="button" className={small} disabled={!name.trim() || busy === "save"} title={name.trim() ? undefined : "Give it a name"} onClick={() => void save()}>
            {busy === "save" ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <button type="button" className={`${small} mt-1.5`} disabled={!stack.length} title={stack.length ? undefined : "Place a preset first"} onClick={() => setNaming(true)}>
          Save as a style{stack.length ? ` (${stack.length})` : ""}
        </button>
      )}
      {!stack.length && !naming && <div className="mt-1 text-[11px] text-text-secondary">Place a preset first.</div>}
    </div>
  );
};
