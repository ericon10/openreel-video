// Character Studio embed (fork only; upstream OpenReel never sets these).
// The Studio opens the editor at /editor/?studio=<post id>; everything the
// embed adds lives in this folder, with a few one-line hooks elsewhere, so
// merges from upstream stay easy.

export interface StudioParams {
  // The Studio post being edited.
  post: string;
  // The Studio API base (same origin).
  api: string;
  // Where Done and Back return to (the post's Finish step).
  back: string;
}

let cached: StudioParams | null | undefined;

export function studioParams(): StudioParams | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return (cached = null);
  const q = new URLSearchParams(window.location.search);
  const post = q.get("studio");
  if (!post || !/^cnt_[a-z0-9]{6,40}$/.test(post)) return (cached = null);
  const api = q.get("api") || "/api/v1";
  const back = q.get("back") || `/studio/posts/${post}?step=finish`;
  // Same origin only: the editor talks to the Studio that opened it.
  const sameOrigin = (u: string) => u.startsWith("/") && !u.startsWith("//");
  if (!sameOrigin(api) || !sameOrigin(back)) return (cached = null);
  return (cached = { post, api, back });
}

export const isStudioEmbed = (): boolean => studioParams() !== null;

// The Studio serves ffmpeg.wasm next to the editor (built by the Studio's
// build-editor script); set before anything loads it.
if (studioParams()) {
  (globalThis as { __OPENREEL_FFMPEG_BASE__?: string }).__OPENREEL_FFMPEG_BASE__ = new URL(`${import.meta.env.BASE_URL}ffmpeg`, window.location.origin).href;
}
