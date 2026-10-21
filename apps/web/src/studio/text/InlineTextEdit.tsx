import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TextClip } from "@openreel/core";
import { useProjectStore } from "../../stores/project-store";
import { useEngineStore } from "../../stores/engine-store";
import { useUIStore } from "../../stores/ui-store";
import { useInlineTextEdit, openInlineTextEdit } from "./edit-state";
import { textClipRect, type TextRect } from "./geometry";

// Edit a caption in place (Character Studio editor QA, 2026-10-15): a box
// over the caption in the preview with its text selected. Enter saves
// (Shift+Enter for a new line), Escape cancels, clicking away saves. One
// undo step, through the same update the inspector uses. The box grows
// with the words (a new line makes it taller), and typing a letter on a
// selected caption starts the edit with that letter (owner, 2026-10-22).

const typable = (e: KeyboardEvent) => e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export const InlineTextEdit: React.FC<{ canvas: HTMLElement | null; overlay: HTMLElement | null; project: { width: number; height: number } }> = ({ canvas, overlay, project }) => {
  const id = useInlineTextEdit((s) => s.id);
  const close = useInlineTextEdit((s) => s.close);
  const seed = useInlineTextEdit((s) => s.seed);
  const clip = useEngineStore((s) => (id ? (s.getTitleEngine()?.getTextClip(id) as TextClip | undefined) : undefined));
  const [value, setValue] = useState("");
  const [rect, setRect] = useState<TextRect | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!clip) return;
    done.current = false;
    setValue(seed ?? clip.text);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A letter typed while a caption is selected (and nothing else has the
  // keyboard) opens the edit with that letter in place of the words.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useInlineTextEdit.getState().id || !typable(e) || inField(e.target)) return;
      const item = useUIStore.getState().selectedItems.find((s) => s.type === "text-clip");
      const tclip = item ? (useEngineStore.getState().getTitleEngine()?.getTextClip(item.id) as TextClip | undefined) : undefined;
      if (!tclip) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openInlineTextEdit(tclip, e.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useLayoutEffect(() => {
    if (!clip || !canvas || !overlay) { setRect(null); return; }
    setRect(textClipRect({ ...clip, text: value || " " }, project, canvas, overlay));
  }, [clip, canvas, overlay, project.width, project.height, value]);

  useEffect(() => {
    if (!rect || !ref.current) return;
    ref.current.focus();
    if (seed) { const n = ref.current.value.length; ref.current.setSelectionRange(n, n); }
    else ref.current.select();
  }, [rect !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id || !clip || !rect) return null;

  const save = () => {
    if (done.current) return;
    done.current = true;
    const text = value.replace(/\s+$/g, "");
    if (text && text !== clip.text) useProjectStore.getState().updateTextContent(clip.id, text);
    close();
  };
  const cancel = () => { done.current = true; close(); };

  const width = Math.max(180, rect.width + 24);
  // Never shorter than its own lines of typing (small captions too).
  const height = Math.max(44, rect.height + 16, value.split("\n").length * 20 + 16);
  return (
    <textarea
      ref={ref}
      aria-label="Edit the caption text"
      data-studio="inline-text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
      }}
      onBlur={save}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute z-50 resize-none rounded-md border-2 border-cyan-500 bg-white px-2 py-1 text-center text-sm font-semibold leading-snug text-black shadow-xl outline-none"
      style={{ left: rect.centerX - width / 2, top: rect.centerY - height / 2, width, height, pointerEvents: "auto" }}
    />
  );
};
