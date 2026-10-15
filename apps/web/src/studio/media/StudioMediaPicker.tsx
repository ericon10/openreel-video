import React, { useEffect, useRef, useState } from "react";
import { addStudioMedia, DRAG_KEY } from "./add";
import { useStudioMedia, type PickerGroup, type PickerItem } from "./state";
import type { StudioParams } from "../params";

// Add media, Studio first (owner, 2026-10-15; the Studio's UX-PLAN.md
// section 21). Studio: this post's takes and stills, this character's clips
// and stills, then the Library. From computer is the second tab (the Media
// tab's own file picker, as before). One tap adds an item at the playhead
// on a new track; drag it onto a track to put it exactly there. A floating
// panel on a computer, a bottom sheet on a phone.

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// True once the element comes near the visible part of the list, so a
// long list asks storage only for the tiles you scroll to.
function useNear(ref: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, near]);
  return near;
}

function Thumb({ item }: { item: PickerItem }) {
  const box = "h-full w-full object-cover";
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref);
  // The editor page is cross-origin isolated: thumbnails load with CORS.
  if (item.thumb) return <img src={item.thumb} alt="" className={box} loading="lazy" draggable={false} crossOrigin="anonymous" />;
  if (item.kind === "video") {
    // No poster: the take's first frame, loaded once the tile comes into
    // view (the direct link when there is one; storage answers it, as it
    // does the editor's own fetch).
    return <div ref={ref} className="h-full w-full">{near && <video src={`${item.src ?? item.url}#t=0.1`} crossOrigin={item.src ? "anonymous" : undefined} preload="metadata" muted playsInline className={box} />}</div>;
  }
  return <div className="flex h-full w-full items-center justify-center text-2xl text-text-secondary" aria-hidden>{item.kind === "audio" ? "\u266B" : "\u25A3"}</div>;
}

export const StudioMediaPicker: React.FC<{ params: StudioParams }> = ({ params }) => {
  const { open, tab, fromComputer, setTab, close } = useStudioMedia();
  const [groups, setGroups] = useState<PickerGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch(`${params.api}/content/${params.post}/editor/media`, { credentials: "same-origin" });
      const body = (await res.json().catch(() => ({}))) as { groups?: PickerGroup[]; error?: { message?: string } };
      if (!res.ok || !body.groups) throw new Error(body.error?.message || `The Studio answered ${res.status}.`);
      setGroups(body.groups);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!open) return;
    setSaid(null);
    void load();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function add(item: PickerItem) {
    setBusy(item.id);
    setSaid({ tone: "ok", text: `Adding ${item.name}...` });
    try {
      const { at } = await addStudioMedia(item);
      setSaid({ tone: "ok", text: `Added ${item.name} at ${clock(at)}, on its own track. Drag it to move it.` });
    } catch (e) {
      setSaid({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const filled = (groups ?? []).filter((g) => g.items.length);
  const tabBtn = (id: "studio" | "computer", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === id ? "bg-[#ff6a3d] text-[#1a0f08]" : "text-text-secondary hover:text-text-primary"}`}>
      {label}
    </button>
  );

  return (
    <div role="dialog" aria-label="Add media" data-studio-media
      className="fixed inset-x-0 bottom-0 z-[9998] flex max-h-[62vh] flex-col rounded-t-xl border border-border bg-bg-1 text-text-primary shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-4 sm:top-[56px] sm:max-h-[min(70vh,640px)] sm:w-[400px] sm:rounded-xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <b className="text-sm">Add media</b>
        <div role="tablist" aria-label="Where from" className="ml-2 flex gap-1">
          {tabBtn("studio", "Studio")}
          {tabBtn("computer", "From computer")}
        </div>
        {/* The Studio's Guide, in a new tab (Step 5: Finish, the editor). */}
        <a className="ml-auto text-xs text-[#3fd1c0] hover:underline" href="/studio/guide#post-finish" target="_blank" rel="noopener">How this works</a>
        <button type="button" className="text-xs text-text-secondary hover:text-text-primary" onClick={close} aria-label="Close">Close</button>
      </div>
      {tab === "studio" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" role="tabpanel" aria-label="Studio">
          <p className="mt-2 text-[11px] text-text-secondary">Tap to add at the playhead on its own track, or drag onto a track.</p>
          {said && <p role="status" className={`mt-1 text-[11px] ${said.tone === "bad" ? "text-[#ff8a6a]" : "text-[#3fd18f]"}`}>{said.text}</p>}
          {error && (
            <p role="alert" className="mt-2 text-xs text-[#ff8a6a]">
              {error} <button type="button" className="underline" onClick={() => void load()}>Try again</button>
            </p>
          )}
          {!groups && !error && <p className="mt-3 text-xs text-text-secondary">Loading the Studio's media...</p>}
          {groups && !filled.length && <p className="mt-3 text-xs text-text-secondary">Nothing in the Studio for this post yet. Use From computer, or keep clips and stills in the Studio first.</p>}
          {filled.map((g) => (
            <section key={g.id} className="mt-3" aria-label={g.label} data-group={g.id}>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{g.label} <span className="font-normal normal-case">({g.items.length})</span></h3>
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((item) => (
                  <button key={item.id} type="button" draggable data-media={item.id} disabled={busy === item.id}
                    title={`${item.name}: tap to add at the playhead, or drag onto a track`}
                    aria-label={`Add ${item.name}`}
                    onClick={() => void add(item)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify({ [DRAG_KEY]: item }));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="group flex flex-col overflow-hidden rounded-lg border border-border bg-bg-2 text-left hover:border-[#ff6a3d] disabled:opacity-60">
                    <div className="relative aspect-[9/16] w-full overflow-hidden bg-black/40">
                      <Thumb item={item} />
                      {item.duration != null && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">{clock(item.duration)}</span>}
                      {busy === item.id && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[11px] text-white">Adding...</span>}
                    </div>
                    <span className="truncate px-1.5 py-1 text-[11px]">{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-3 py-3" role="tabpanel" aria-label="From computer">
          <p className="text-xs text-text-secondary">Files from this computer or phone go into the Media tab, as before. To use a file again in other posts, upload it to the Studio's Library.</p>
          <button type="button" className="self-start rounded-lg bg-[#ff6a3d] px-3 py-1.5 text-xs font-bold text-[#1a0f08]"
            onClick={() => { fromComputer?.(); close(); }}>
            Choose files
          </button>
        </div>
      )}
    </div>
  );
};
