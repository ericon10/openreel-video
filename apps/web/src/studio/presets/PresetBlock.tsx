import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AdjustmentLayer } from "@openreel/core";
import { presetById } from "@openreel/core/studio";
import { useTimelineTouchGesture, listenTimelineGesture } from "../../components/editor/timeline/touch-gestures";
import { useProjectStore } from "../../stores/project-store";
import { snapTime } from "./snap";
import { usePresetUi } from "./state";

// A preset on the Presets track (Character Studio embed): drag to move,
// drag an edge to trim, click to open its panel (strength, keyframes).
// Moves snap to cuts, beats, markers and the playhead; each gesture is one
// undo step.

const MIN = 0.1;

export const PresetBlock: React.FC<{ layer: AdjustmentLayer; pixelsPerSecond: number; frameRate: number }> = ({ layer, pixelsPerSecond, frameRate }) => {
  const touch = useTimelineTouchGesture();
  const selected = usePresetUi((s) => s.selected === layer.id);
  const select = usePresetUi((s) => s.select);
  const [gesture, setGesture] = useState<"move" | "left" | "right" | null>(null);
  const start = useRef({ x: 0, startTime: 0, duration: 0 });
  const def = layer.studio ? presetById(layer.studio.preset) : undefined;

  const commit = useCallback((startTime: number, duration: number) => {
    const project = useProjectStore.getState().project;
    const layers = (project.adjustmentLayers ?? []).map((l) => (l.id === layer.id ? { ...l, startTime, duration } : l));
    void useProjectStore.getState().executeAction({ type: "adjustment/setAll", id: crypto.randomUUID(), timestamp: Date.now(), params: { layers } });
  }, [layer.id]);

  const begin = (event: React.MouseEvent, kind: "move" | "left" | "right") => {
    if (touch.shouldIgnoreMouse(event) || event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    select(layer.id);
    start.current = { x: event.clientX, startTime: layer.startTime, duration: layer.duration };
    useProjectStore.getState().beginHistoryGroup(kind === "move" ? `Move ${layer.name}` : `Trim ${layer.name}`);
    setGesture(kind);
    return true;
  };

  useEffect(() => {
    if (!gesture) return;
    const frame = 1 / Math.max(1, frameRate);
    const onMove = (event: MouseEvent) => {
      const delta = (event.clientX - start.current.x) / pixelsPerSecond;
      const s0 = start.current.startTime, d0 = start.current.duration;
      const snapPx = 8 / pixelsPerSecond;
      if (gesture === "move") {
        // A transition snaps by its centre (the cut); others by their start.
        const centre = def?.anchor === "cut";
        const raw = Math.max(0, s0 + delta);
        const target = centre ? snapTime(raw + d0 / 2, snapPx) - d0 / 2 : snapTime(raw, snapPx);
        commit(Math.max(0, Math.round(target / frame) * frame), d0);
      } else if (gesture === "left") {
        const end = s0 + d0;
        const next = Math.min(end - MIN, Math.max(0, snapTime(s0 + delta, snapPx)));
        commit(next, end - next);
      } else {
        commit(s0, Math.max(MIN, snapTime(s0 + d0 + delta, snapPx) - s0));
      }
    };
    const onUp = () => {
      setGesture(null);
      useProjectStore.getState().endHistoryGroup();
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = gesture === "move" ? "grabbing" : "ew-resize";
    document.body.style.userSelect = "none";
    return listenTimelineGesture(touch.pointerId, onMove, onUp);
  }, [commit, def?.anchor, frameRate, gesture, pixelsPerSecond, touch]);

  const strength = layer.studio?.strength ?? "normal";
  return (
    <div
      data-timeline-clip
      data-studio-preset={layer.studio?.preset}
      aria-pressed={selected}
      aria-label={`${layer.name} preset, ${strength}`}
      onPointerDown={touch.bodyPointerDown}
      onMouseDown={(e) => begin(e, "move")}
      onClick={(e) => { if (touch.consumeTap()) select(layer.id); e.stopPropagation(); }}
      className={`absolute top-1 bottom-1 z-20 flex min-w-[14px] items-center overflow-hidden rounded-md border text-[10px] font-semibold text-white shadow-sm ${
        selected ? "border-white bg-orange-500 ring-2 ring-orange-300/70" : "border-orange-300/60 bg-orange-500/85"
      } ${layer.enabled ? "" : "opacity-50"} ${gesture === "move" ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ left: layer.startTime * pixelsPerSecond, width: Math.max(14, layer.duration * pixelsPerSecond) }}
      title={`${layer.name} (${strength}). Drag to move, drag an edge to trim, click to edit.`}
    >
      <button type="button" aria-label={`Trim start of ${layer.name}`} data-timeline-trim="left"
        className="h-full w-1.5 shrink-0 cursor-ew-resize bg-white/25 hover:bg-white/60"
        onPointerDown={(e) => touch.start(e, (ev) => begin(ev, "left"))} onMouseDown={(e) => begin(e, "left")} />
      <span className="truncate px-1.5">{layer.name}{strength !== "normal" ? ` · ${strength}` : ""}</span>
      <button type="button" aria-label={`Trim end of ${layer.name}`} data-timeline-trim="right"
        className="ml-auto h-full w-1.5 shrink-0 cursor-ew-resize bg-white/25 hover:bg-white/60"
        onPointerDown={(e) => touch.start(e, (ev) => begin(ev, "right"))} onMouseDown={(e) => begin(e, "right")} />
    </div>
  );
};
