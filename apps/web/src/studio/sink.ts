// An in-memory file the export engine writes into (it seeks back to patch
// the MP4 header, so a plain stream is not enough). The same approach as
// the agent export runner, kept here so upstream files stay untouched.

function toUint8(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof Blob) throw new Error("Blob chunks are not supported by the Studio export sink");
  throw new Error("Unsupported chunk type written to the export");
}

export interface MemoryFile {
  readonly writable: FileSystemWritableFileStream;
  blob(type: string): Blob;
}

export function memoryFile(): MemoryFile {
  const parts: Array<{ pos: number; data: Uint8Array }> = [];
  let position = 0;
  let size = 0;
  const put = (u8: Uint8Array) => {
    // Copy: the encoder may reuse its buffers.
    parts.push({ pos: position, data: u8.slice() });
    position += u8.byteLength;
    if (position > size) size = position;
  };
  const sink = {
    async seek(pos: number) { position = pos; },
    async truncate(next: number) { size = next; },
    async close() {},
    async abort() {},
    async write(chunk: unknown) {
      if (chunk && typeof chunk === "object" && "type" in chunk && !ArrayBuffer.isView(chunk)) {
        const cmd = chunk as { type: string; data?: unknown; position?: number; size?: number };
        if (cmd.type === "seek") { if (typeof cmd.position === "number") position = cmd.position; return; }
        if (cmd.type === "truncate") { if (typeof cmd.size === "number") size = cmd.size; return; }
        if (cmd.type === "write") { if (typeof cmd.position === "number") position = cmd.position; put(toUint8(cmd.data)); return; }
      }
      put(toUint8(chunk));
    },
  };
  return {
    writable: sink as unknown as FileSystemWritableFileStream,
    blob(type: string) {
      const buffer = new Uint8Array(size);
      for (const part of parts) {
        const room = Math.max(0, Math.min(part.data.byteLength, size - part.pos));
        if (room) buffer.set(part.data.subarray(0, room), part.pos);
      }
      return new Blob([buffer], { type });
    },
  };
}
