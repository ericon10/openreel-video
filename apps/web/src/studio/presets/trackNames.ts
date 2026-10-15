// The Studio names the tracks it lays out (owner, 2026-10-15): Shots,
// B-roll, Voice, Music, Ambience, beside Captions and Presets, instead of
// "Track 1, 2, 3". A track the owner renamed keeps its name.

export type MediaRole = "clip" | "broll" | "music" | "ambience" | "voice";
const NAMES: Record<MediaRole, string> = { clip: "Shots", broll: "B-roll", voice: "Voice", music: "Music", ambience: "Ambience" };
const ORDER: MediaRole[] = ["clip", "broll", "voice", "music", "ambience"];
const GENERIC = /^(?:track|video|audio|image)?\s*\d*$/i;

export function trackNames(
  tracks: readonly { readonly id: string; readonly name?: string; readonly clips: readonly { readonly mediaId: string }[] }[],
  roleOf: (mediaId: string) => MediaRole | undefined,
): Array<{ trackId: string; name: string }> {
  const out: Array<{ trackId: string; name: string }> = [];
  const used = new Map<string, number>();
  for (const t of tracks) {
    if (t.name && !GENERIC.test(t.name.trim())) continue;
    const roles = new Set(t.clips.map((c) => roleOf(c.mediaId)).filter((r): r is MediaRole => !!r));
    const role = ORDER.find((r) => roles.has(r));
    if (!role) continue;
    const base = NAMES[role];
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.push({ trackId: t.id, name: n === 1 ? base : `${base} ${n}` });
  }
  return out;
}
