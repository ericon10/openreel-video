import React, { useMemo } from "react";
import { useInspectorNavigationStore } from "../../stores/inspector-navigation-store";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { timeMarkers } from "./markers";

// Freeze and speed ramp markers on the Presets track (owner, 2026-10-15):
// they change the shot, so they have no block; a marker at their time opens
// the shot's Speed Curves panel (on a phone, the Edit tab too).

export function openSpeedPanel(clipId: string, trackId: string): void {
  useUIStore.getState().select({ type: "clip", id: clipId, trackId });
  useInspectorNavigationStore.getState().requestSection("speed-curves", clipId);
  window.dispatchEvent(new CustomEvent("openreel:compact-panel", { detail: "inspector" }));
}

export const TimeMarkers: React.FC<{ pixelsPerSecond: number }> = ({ pixelsPerSecond }) => {
  const tracks = useProjectStore((s) => s.project.timeline.tracks);
  const markers = useMemo(() => timeMarkers(tracks), [tracks]);
  return (
    <>
      {markers.map((m) => (
        <button
          key={`${m.kind}-${m.clipId}-${m.at}`}
          type="button"
          data-studio-marker={m.kind}
          aria-label={`${m.label} at ${m.at.toFixed(2)} s: open its Speed panel`}
          title={`${m.label} at ${m.at.toFixed(2)} s. Click to change it in the shot's Speed panel.`}
          className="absolute top-1 bottom-1 z-20 flex items-center gap-1 rounded-md border border-sky-300/70 bg-sky-500/85 px-1.5 text-[10px] font-semibold text-white shadow-sm hover:bg-sky-500"
          style={{ left: m.at * pixelsPerSecond - 1 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openSpeedPanel(m.clipId, m.trackId); }}
        >
          <span aria-hidden className="inline-block h-2 w-2 rotate-45 bg-white" />
          {m.label}
        </button>
      ))}
    </>
  );
};
