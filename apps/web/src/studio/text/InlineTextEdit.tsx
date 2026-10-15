import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TextClip } from "@openreel/core";
import { useProjectStore } from "../../stores/project-store";
import { useEngineStore } from "../../stores/engine-store";
import { useInlineTextEdit } from "./edit-state";
import { textClipRect, type TextRect } from "./geometry";

// Edit a caption in place (Character Studio editor QA, 2026-10-15): a box
// over the caption in the preview with its text selected. Enter saves
// (Shift+Enter for a new line), Escape cancels, clicking away saves. One
// undo step, through the same update the inspector uses.

export const InlineTextEdit: React.FC<{ canvas: HTMLElement | null; overlay: HTMLElement | null; project: { width: number; height: number } }> = ({ canvas, overlay, project }) => {
  const id = useInlineTextEdit((s) => s.id);
  const close = useInlineTextEdit((s) => s.close);
  const clip = useEngineStore((s) => (id ? (s.getTitleEngine()?.getTextClip(id) as TextClip | undefined) : undefined));
  const [value, setValue] = useState("");
  const [rect, setRect] = useState<TextRect | null>(null);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!clip) return;
    done.current = false;
    setValue(clip.text);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!clip || !canvas || !overlay) { setRect(null); return; }
    setRect(textClipRect(clip, project, canvas, overlay));
  }, [clip, canvas, overlay, project.width, project.height]);

  useEffect(() => {
    if (!rect || !ref.current) return;
    ref.current.focus();
    ref.current.select();
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
  const height = Math.max(44, rect.height + 16);
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
