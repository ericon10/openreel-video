import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBlob } from "../bridge";

// Where a Studio file comes from (owner, 2026-10-15: the take was missing
// on the live site). The fresh storage link first, then the Studio's own
// address, then the Studio in parts of 4 MB; never the browser's cache,
// which kept storage's answer for a <video> without a CORS header.

const media = { name: "Shot 1", kind: "video" as const, url: "/api/v1/assets/ast_1/content", src: "https://r2.test/acct/ast_1.mp4?sig=1" };
// jsdom's Blob has no text(); FileReader reads any Blob.
const read = (b: Blob) => (typeof b.text === "function" ? b.text() : new Promise<string>((done) => { const f = new FileReader(); f.onload = () => done(String(f.result)); f.readAsText(b); }));
const ok = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers });

afterEach(() => { vi.unstubAllGlobals(); });

describe("fetchBlob", () => {
  it("takes the fresh storage link first, in CORS mode, without the cache", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init]); return ok("take"); }));
    expect(await read(await fetchBlob(media))).toBe("take");
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(media.src);
    expect(calls[0]![1]).toMatchObject({ mode: "cors", credentials: "omit", cache: "no-store" });
  });

  it("storage refuses: the Studio's own address, still without the cache", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url === media.src) throw new TypeError("Failed to fetch");
      return ok("take");
    }));
    expect(await read(await fetchBlob(media))).toBe("take");
    expect(calls.map((c) => c[0])).toEqual([media.src, media.url]);
    expect(calls[1]![1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });

  it("both refused: the Studio sends it in parts, joined in order", async () => {
    const whole = "0123456789";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes("proxy=1")) throw new TypeError("Failed to fetch");
      const m = /bytes=(\d+)-(\d+)/.exec((init?.headers as Record<string, string>).range)!;
      // Parts of 4 MB are asked for; this file is 10 bytes, so one part.
      const start = Number(m[1]);
      const end = Math.min(Number(m[2]), whole.length - 1);
      return ok(whole.slice(start, end + 1), 206, { "content-range": `bytes ${start}-${end}/${whole.length}`, "content-type": "video/mp4" });
    }));
    const blob = await fetchBlob(media);
    expect(await read(blob)).toBe(whole);
    expect(blob.type).toBe("video/mp4");
  });

  it("names the file and every way it tried when nothing works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok("no", 403)));
    await expect(fetchBlob(media)).rejects.toThrow(/Shot 1 could not be loaded \(storage 403; studio 403; parts: answered 403\)/);
  });
});
