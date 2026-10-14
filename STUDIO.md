# Character Studio embed (fork notes)

This fork's `studio-embed` branch runs OpenReel as Character Studio's editor.
Upstream is kept as the `upstream` remote (Augani/openreel-video); merge it
into this branch to update. Everything the embed adds lives in
`apps/web/src/studio/` and `packages/core/src/studio/`; upstream files have
only these small hooks:

| File | Hook |
|---|---|
| `apps/web/src/main.tsx` | Renders `StudioEditor` when the page has `?studio=<post id>`; no service worker in that case |
| `apps/web/src/hooks/useProjectRecovery.ts` | Skips the recovery dialog inside the Studio |
| `packages/core/src/media/ffmpeg-fallback.ts` | Reads the ffmpeg.wasm base URL from `globalThis.__OPENREEL_FFMPEG_BASE__` (the Studio serves the core itself) |
| `packages/core/src/video/adjustment-layer-engine.ts` | `AdjustmentLayer.studio`: a preset block's keys and strength |
| `packages/core/src/video/video-engine.ts` | The export draws a preset as it reaches the preset's track, so it moves only the tracks below (captions above stay still) |
| `apps/web/src/components/editor/Preview.tsx` | The same for the live preview |
| `apps/web/src/components/editor/AssetsPanel.tsx` | A Presets tab (the default tab in the Studio) |
| `apps/web/src/components/editor/timeline/TrackLane.tsx` | A preset block renders as `PresetBlock` (drag, trim, select) |
| `apps/web/src/components/editor/Toolbar.tsx` | OpenReel's Export is hidden in the Studio; Done exports |
| `apps/web/src/components/editor/timeline/utils.ts` | Clips also snap to beats and markers in the Studio |
| `apps/web/src/components/editor/timeline/ClipComponent.tsx` | Ripple trim after a trim gesture (`studio/presets/ripple.ts`) |

How it works: the Studio serves the built editor at `/editor/` with
cross-origin isolation headers and opens it as
`/editor/?studio=<post id>`. The editor asks the Studio for the post
(`GET /api/v1/content/<id>/editor`: media, captions, saved project), puts
it on the timeline, and Done exports in the browser (MP4 with H.264, or
WebM with VP9 where the browser has no H.264 encoder), uploads it with
the Studio's upload slots and posts the project back
(`POST /api/v1/content/<id>/editor`). The Studio's worker makes the export
a plain MP4 and keeps the project for the next edit.

Presets (`packages/core/src/studio/presets.ts`): the edit library as data
(transitions, moments, text, caption looks, layouts). Camera presets are
adjustment layers with normalized keyframes (time 0 to 1 across the block;
zoom, move, rotate, blur, streak, RGB split, shake, flash, dark, colour,
brightness, vignette), scaled by Subtle, Normal or Strong. `cameraAt` is
pure and unit tested; the Studio's worker mirrors it for batch renders.
Time presets use OpenReel's speed engine (ramps, freeze, reverse); text
presets use its text animations, behind-subject text and karaoke
subtitles; layouts use transforms, crops and the person cutout. Track
order: captions, Presets, footage, audio (`apps/web/src/studio/presets/order.ts`).

Beat sync (`apps/web/src/studio/presets/beat.ts`): the beat of the post's
music (found when the editor opens), of a track added in the Beat card, a
tapped tempo or a typed BPM, shown with OpenReel's beat overlay; clips and
preset blocks snap to beats; "Music in the export" mutes the music tracks
in the export. Saved styles (`packages/core/src/studio/style.ts`,
`apps/web/src/studio/presets/styles.ts`): the presets as a stack with
relative places (payoff, cut, beat, start, end), saved per account in the
Studio and carried by "Make another like this". Beats, music, the export
switch and the non-block presets are saved in the project JSON
(`studioBeats`, `studioMusic`, `studioMusicInExport`, `studioApplied`).

Build (from the Studio repo): `npm run build:editor`. License: MIT
(Augustus Otu and Contributors); the Studio shows it in Settings, Notices.
