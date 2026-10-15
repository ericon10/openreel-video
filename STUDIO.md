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
| `apps/web/src/components/editor/timeline/ClipComponent.tsx` | Ripple trim after a trim gesture (`studio/presets/ripple.ts`); a shot dropped onto another on the same track swaps into place (`studio/presets/reorder.ts`) instead of stacking on a new track |
| `apps/web/src/components/editor/Preview.tsx` (captions) | A click on a caption selects it, a double-click (or a double-tap) edits it in place (`studio/text/`), and the selection box is measured from the wrapped lines (`studio/text/geometry.ts`) and drags the caption. A resize follows the handle (the box grows from its center), one drag is one undo step, touch pointers drag and resize too, and the handles sit just outside the box |
| `apps/web/src/components/editor/timeline/TextClipComponent.tsx` | A double-click on a caption block edits it in place |
| `packages/core/src/text/title-engine.ts` | Captions wrap inside the frame (`wrapWidthFor`), measured and drawn with the same lines; `TextStyle.highlightColor` lights the words in turn (karaoke, `karaokeLitWords`) in the preview and the export |
| `packages/core/src/text/types.ts` | `TextStyle.highlightColor` |
| `packages/core/src/media/mediabunny-engine.ts`, `media-import-service.ts` | M4A (AAC) audio imports; the Studio stores uploaded music that way |
| `apps/web/src/components/editor/inspector/AudioDuckingSection.tsx` | `buildTriggerTrackBuffer` is exported so the Studio ducks the music under the voice when a post opens |
| `apps/web/src/components/editor/Preview.tsx` (usability) | Four small corner dots just outside a caption (finger-sized hit areas), no Locked button on text, a uniform resize capped at the frame's height (`capScaleToFrame` in `studio/text/geometry.ts`), and a click on empty space clears the selection |
| `apps/web/src/components/editor/timeline/TrackLane.tsx` (markers) | The Presets track shows a marker for each freeze and speed ramp (`studio/presets/TimeMarkers.tsx`, `markers.ts`); a click selects the shot and opens its Speed Curves section (on a phone, the Edit tab) |
| `apps/web/src/components/editor/timeline/ClipComponent.tsx` (speed) | A shot shows its speed on its block: 2x, Ramp, Freeze (`speedLabel`) |
| `apps/web/src/components/editor/EditorInterface.tsx`, `Toolbar.tsx` | A bigger preview in the Studio: the timeline starts shorter and the header bar is hidden; listens for `openreel:compact-panel` to switch the phone tab |
| `apps/web/src/components/editor/AssetsPanel.tsx` (Add media) | In the Studio, Add media and Import media open the Studio media picker (`studio/media/`): Studio first (this post's takes and stills, the character's clips and stills, the Library), From computer second (this panel's own file input) |
| `apps/web/src/components/editor/timeline/TrackLane.tsx`, `Timeline.tsx` (drops) | An item dragged from the Studio picker (`application/json` `{ studioMedia }`) is fetched, added to the media library and placed where it is dropped (`handleStudioDrop` in `studio/media/add.ts`) |
| `apps/web/src/studio/bridge.ts` (track names) | The tracks the Studio lays out are named by what they hold: Shots, B-roll, Voice, Music, Ambience (`studio/presets/trackNames.ts`); a freeze or ramp makes sure the Presets track exists |

How it works: the Studio serves the built editor at `/editor/` with
cross-origin isolation headers and opens it as
`/editor/?studio=<post id>`. The editor asks the Studio for the post
(`GET /api/v1/content/<id>/editor`: media, captions, saved project, No
caption), puts it on the timeline (each file from its fresh storage link
`src`, never from the browser's cache, then the Studio's address, then the
Studio in parts of 4 MB; see `fetchBlob`), and Done exports in the browser (MP4 with H.264, or
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
presets use its text animations, behind-subject text and karaoke (the
caption's own words light up; it keeps its place, look and text);
layouts use transforms, crops and the person cutout. Track order:
captions, Presets, footage, audio (`apps/web/src/studio/presets/order.ts`).

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

Opening a post (`apps/web/src/studio/bridge.ts`): a file that does not
load is named in the bar and the rest of the post opens; sound ends with
the post; the music is ducked under the voice (or the clip's sound) with
OpenReel's ducker. `StudioEditor.tsx` fits the editor under the Studio's
bar (the phone tabs stay on screen) and redraws the first frame while the
clips finish loading. While the post is open, `studio/follow.ts` keeps a
caption or sound clip that ended with the last shot ending with it when the
shots change length, so the export never runs on over black.

Tests: the Studio repo drives this editor like a user with Playwright
(`e2e/editor/`, `npm run e2e:editor` against `npm run studio`).

Build (from the Studio repo): `npm run build:editor`. License: MIT
(Augustus Otu and Contributors); the Studio shows it in Settings, Notices.
