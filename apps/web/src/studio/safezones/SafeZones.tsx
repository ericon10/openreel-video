import React, { useLayoutEffect, useState } from "react";
import { ZONES, bandBox, type Box } from "./zones";
import { useSafeZones } from "./state";

// The app's own buttons and captions drawn over the preview (TikTok or
// Reels), so captions stay where they read. Never exported, never clicked.
export const SafeZones: React.FC<{ canvas: HTMLElement | null; overlay: HTMLElement | null }> = ({ canvas, overlay }) => {
  const app = useSafeZones((s) => s.app);
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (app === "off" || !canvas || !overlay) { setBox(null); return; }
    const measure = () => {
      const o = overlay.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      setBox({ left: c.left - o.left, top: c.top - o.top, width: c.width, height: c.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    ro.observe(overlay);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [app, canvas, overlay]);
  if (app === "off" || !box) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-40" data-studio="safe-zones" data-app={app} aria-hidden>
      {ZONES[app].bands.map((b) => {
        const r = bandBox(b, box);
        return (
          <div key={b.label} data-studio-band={b.label} style={{ position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height, background: "rgba(255, 64, 96, 0.22)", outline: "1px dashed rgba(255, 140, 160, 0.9)", outlineOffset: -1 }}>
            <span style={{ position: "absolute", left: 4, top: 2, font: "600 10px system-ui", color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)", whiteSpace: "nowrap" }}>{ZONES[app].label}: {b.label}</span>
          </div>
        );
      })}
    </div>
  );
};
