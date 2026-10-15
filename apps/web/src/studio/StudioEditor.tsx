import { useEffect, useRef, useState } from "react";
import App from "../App";
import { useUIStore } from "../stores/ui-store";
import { openPost, saveToStudio } from "./bridge";
import { ONBOARDING_KEY } from "../components/editor/tour/tour-steps";
import { useThemeStore } from "../stores/theme-store";
import { PresetInspector } from "./presets/PresetInspector";
import { usePresetUi } from "./presets/state";
import { cuts } from "./presets/actions";
import { setStylesApi } from "./presets/styles";
import { rippleOn, setRipple } from "./presets/ripple";
import type { StudioParams } from "./params";
import { followLastShot } from "./follow";
import { StudioMediaPicker } from "./media/StudioMediaPicker";
import { setActiveMedia } from "./media/add";
import { useSafeZones } from "./safezones/state";
import type { SafeZoneApp } from "./safezones/zones";

// The editor opened from a Studio post: the post goes onto the timeline,
// a slim bar on top says where you came from, and Done exports the video,
// saves it with the project to the post, and returns to the Finish step.
// Every button shows what it is doing; errors say what to do next.

type Phase = { kind: "loading"; step: string } | { kind: "ready"; notice?: string } | { kind: "saving"; step: string } | { kind: "error"; message: string; retry: "open" | "save" };

const bar: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, height: 40, zIndex: 9999, display: "flex", alignItems: "center", gap: 12,
  padding: "0 12px", background: "#15110d", borderBottom: "1px solid rgba(255,246,235,0.1)", color: "#f5ede4",
  font: "500 13px/1 system-ui, -apple-system, Segoe UI, sans-serif",
};
const btn = (primary: boolean): React.CSSProperties => ({
  height: 28, padding: "0 14px", borderRadius: 8, border: primary ? "none" : "1px solid rgba(255,246,235,0.18)",
  background: primary ? "#ff6a3d" : "transparent", color: primary ? "#1a0f08" : "#f5ede4", fontWeight: 700, cursor: "pointer",
});

export function StudioEditor({ params }: { params: StudioParams }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", step: "Opening the post..." });
  const [title, setTitle] = useState("");
  const [ripple, setRippleState] = useState(rippleOn());
  const media = useRef<Record<string, string>>({});
  const started = useRef(false);
  const unfollow = useRef<(() => void) | null>(null);

  async function open() {
    setPhase({ kind: "loading", step: "Opening the post..." });
    try {
      const r = await openPost(params, (step) => setPhase({ kind: "loading", step }));
      media.current = r.media;
      // Items added from the Studio media picker join this map, so they
      // open again with the post.
      setActiveMedia(media.current);
      setTitle(r.manifest.post.title);
      setStylesApi(params.api);
      usePresetUi.getState().setStyles(r.manifest.styles ?? []);
      // Suggested spots: the Studio's (the payoff) and every cut.
      usePresetUi.getState().setSpots([
        ...(r.manifest.suggestions ?? []),
        ...cuts().map((time, i) => ({ label: `Cut ${i + 1}`, time, why: "Between two shots: a good place for a transition." })),
      ].sort((a, b) => a.time - b.time));
      // A file that did not load is named; the rest of the post is here.
      setPhase({ kind: "ready", notice: r.warnings.length ? `Opened without: ${r.warnings.join(" ")} The rest of the post is here.` : undefined });
      // The preview's first frame is drawn before the clips can be decoded
      // and stayed black until a seek or Play (editor QA, 2026-10-15):
      // redraw it a few times while they finish loading.
      for (const ms of [300, 1000, 2500, 5000]) setTimeout(() => window.dispatchEvent(new Event("openreel:preview-invalidate")), ms);
      // Captions and sound that end with the last shot keep ending with it.
      unfollow.current?.();
      unfollow.current = followLastShot();
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message, retry: "open" });
    }
  }

  async function done() {
    setPhase({ kind: "saving", step: "Exporting the video..." });
    try {
      await saveToStudio(params, media.current, (step) => setPhase({ kind: "saving", step }));
      setPhase({ kind: "saving", step: "Saved. Back to the post..." });
      window.location.assign(params.back);
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message, retry: "save" });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Straight to the editor: no welcome screen or first-run tour inside
    // the Studio (its Guide covers the editor).
    useUIStore.setState({ skipWelcomeScreen: true });
    // The Studio is dark; so is its editor.
    useThemeStore.getState().setMode("dark");
    try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch { /* private window */ }
    if (!window.location.hash.startsWith("#/editor")) window.location.hash = "#/editor";
    void open();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => unfollow.current?.(), []);

  const busy = phase.kind === "loading" || phase.kind === "saving";
  const safe = useSafeZones((s) => s.app);
  const setSafe = useSafeZones((s) => s.set);
  return (
    <>
      <div style={bar} role="toolbar" aria-label="Character Studio">
        <button type="button" style={btn(false)} disabled={phase.kind === "saving"} onClick={() => window.location.assign(params.back)}>Back to the post</button>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>
          {phase.kind === "error" ? <span style={{ color: "#ff8a6a" }}>{phase.message}</span> : busy ? phase.step : phase.kind === "ready" && phase.notice ? <span role="status" style={{ color: "#ffc76a" }} title={phase.notice}>{phase.notice}</span> : title ? `Editing: ${title}` : "Editing"}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.85 }} title="Trim a shot shorter and the shots after it slide over, so no gap opens">
          <input type="checkbox" checked={ripple} onChange={(e) => { setRipple(e.target.checked); setRippleState(e.target.checked); }} />
          Ripple trim
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.85 }} title="Where TikTok or Reels draw their buttons and captions over the video. Shown in the preview only, never exported">
          Safe zones
          <select aria-label="Safe zones" value={safe} onChange={(e) => setSafe(e.target.value as SafeZoneApp)} style={{ background: "#1c1714", color: "#f5ede4", border: "1px solid rgba(245,237,228,0.25)", borderRadius: 6, padding: "2px 4px", font: "inherit" }}>
            <option value="off">Off</option>
            <option value="tiktok">TikTok</option>
            <option value="reels">Reels</option>
          </select>
        </label>
        {phase.kind === "error" && <button type="button" style={btn(false)} onClick={() => void (phase.retry === "open" ? open() : done())}>Retry</button>}
        <button type="button" style={btn(true)} disabled={phase.kind !== "ready" && !(phase.kind === "error" && phase.retry === "save")} onClick={() => void done()} aria-busy={phase.kind === "saving"}>
          {phase.kind === "saving" ? "Saving..." : "Done"}
        </button>
      </div>
      {/* The editor fills the space under this bar. Upstream sizes it to the
          whole screen, which pushed its bottom 40 px (the phone tabs, the
          end of the timeline) off the page (editor QA, 2026-10-15). */}
      <style>{".studio-embed-app > div, .studio-embed-app .editor-compact { height: 100% !important; }"}</style>
      <div className="studio-embed-app" style={{ position: "fixed", top: 40, left: 0, right: 0, bottom: 0 }}>
        {phase.kind === "loading" ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#f5ede4", font: "500 14px system-ui" }}>{phase.step}</div>
        ) : (
          <App />
        )}
      </div>
      {phase.kind !== "loading" && <PresetInspector />}
      {phase.kind !== "loading" && <StudioMediaPicker params={params} />}
    </>
  );
}
