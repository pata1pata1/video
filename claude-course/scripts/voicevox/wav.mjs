// Minimal PCM WAV read/write helpers (no dependencies).

/** Parses a PCM WAV buffer into its format and raw sample data. */
export function parseWav(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file.");
  }
  let fmt = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("WAV has no fmt/data chunk.");
  if (fmt.audioFormat !== 1) throw new Error(`Unexpected WAV codec (format ${fmt.audioFormat}); expected PCM.`);
  const frameBytes = fmt.channels * (fmt.bitsPerSample / 8);
  return { ...fmt, frameBytes, data, frames: Math.floor(data.length / frameBytes) };
}

/** 44-byte PCM WAV header. */
export function wavHeader(dataBytes, { channels, sampleRate, bitsPerSample }) {
  const h = Buffer.alloc(44);
  const blockAlign = channels * (bitsPerSample / 8);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

export function sameFormat(a, b) {
  return a.sampleRate === b.sampleRate && a.channels === b.channels && a.bitsPerSample === b.bitsPerSample;
}
