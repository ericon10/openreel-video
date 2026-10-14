# Character Studio embed (fork notes)

This fork's `studio-embed` branch runs OpenReel as Character Studio's editor.
Upstream is kept as the `upstream` remote (Augani/openreel-video); merge it
into this branch to update. Everything the embed adds lives in
`apps/web/src/studio/`; upstream files have only these small hooks:

| File | Hook |
|---|---|
| `apps/web/src/main.tsx` | Renders `StudioEditor` when the page has `?studio=<post id>`; no service worker in that case |
| `apps/web/src/hooks/useProjectRecovery.ts` | Skips the recovery dialog inside the Studio |
| `packages/core/src/media/ffmpeg-fallback.ts` | Reads the ffmpeg.wasm base URL from `globalThis.__OPENREEL_FFMPEG_BASE__` (the Studio serves the core itself) |

How it works: the Studio serves the built editor at `/editor/` with
cross-origin isolation headers and opens it as
`/editor/?studio=<post id>`. The editor asks the Studio for the post
(`GET /api/v1/content/<id>/editor`: media, captions, saved project), puts
it on the timeline, and Done exports in the browser (MP4 with H.264, or
WebM with VP9 where the browser has no H.264 encoder), uploads it with
the Studio's upload slots and posts the project back
(`POST /api/v1/content/<id>/editor`). The Studio's worker makes the export
a plain MP4 and keeps the project for the next edit.

Build (from the Studio repo): `npm run build:editor`. License: MIT
(Augustus Otu and Contributors); the Studio shows it in Settings, Notices.
