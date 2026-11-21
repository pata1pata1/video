// 落ち着いた BGM をコードで作る（2026-11-22、語りのショート story-short 用）。
// 外部の曲を使わない自作の音源なので、著作権・利用条件の問題がない（どの PC でも同じ音が作れる。音声ファイル自体は Git 管理外）。
//
//   node scripts/make-bgm.mjs [--name=calm-pad-01] [--seconds=150]
//   → _shared/bgm/<name>.wav（48kHz・ステレオ・16bit）と _shared/bgm/<name>.json（作り方とライセンスの記録）
//
// 音：ゆっくり移り変わる和音のパッド（Fmaj7 → Em7 → Dm7 → Cmaj7、8秒ずつ）＋時々鳴る柔らかい鈴の音。声の邪魔をしない中低域中心。
// 台本では script.json の bgm（{ "file": "_shared/bgm/calm-pad-01.wav", "gainDb": -20 }）。声の下で自動的に下がる（ダッキング）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const name = arg("name", "calm-pad-01");
const seconds = Number(arg("seconds", "150"));
if (!/^[a-z0-9-]+$/.test(name) || !(seconds > 10 && seconds <= 600)) throw new Error("--name は英小文字・数字・-、--seconds は 10〜600");

const SR = 48000;
const N = Math.round(SR * seconds);
const L = new Float32Array(N);
const R = new Float32Array(N);
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// 和音（MIDI）：Fmaj7 / Em7 / Dm7 / Cmaj7
const CHORDS = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];
const CHORD_SEC = 8;
// 決まった並びの擬似乱数（毎回同じ音にする）
let seed = 20261122;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// パッド：和音ごとに柔らかく立ち上がり、次の和音と重ねて移る
for (let ci = 0; ci * CHORD_SEC < seconds + CHORD_SEC; ci++) {
  const chord = CHORDS[ci % CHORDS.length];
  const t0 = ci * CHORD_SEC - 1.5;
  const len = CHORD_SEC + 3;
  for (const [ni, note] of chord.entries()) {
    for (const det of [-0.12, 0.12]) {
      const f = midi(note) * 2 ** (det / 12);
      const pan = 0.5 + (ni - 1.5) * 0.12 + det;
      const a0 = Math.max(0, Math.round(t0 * SR));
      const a1 = Math.min(N, Math.round((t0 + len) * SR));
      let ph = rnd() * Math.PI * 2;
      for (let i = a0; i < a1; i++) {
        const t = i / SR - t0;
        const env = Math.min(1, t / 2.5) * Math.min(1, (len - t) / 2.5);
        const s = (Math.sin(ph) + 0.18 * Math.sin(2 * ph)) * env * 0.035;
        ph += (2 * Math.PI * f) / SR;
        L[i] += s * (1 - pan);
        R[i] += s * pan;
      }
    }
  }
  // 低音（和音の根音の1オクターブ下）
  const f = midi(chord[0] - 12);
  const a0 = Math.max(0, Math.round(t0 * SR));
  const a1 = Math.min(N, Math.round((t0 + len) * SR));
  for (let i = a0; i < a1; i++) {
    const t = i / SR - t0;
    const env = Math.min(1, t / 3) * Math.min(1, (len - t) / 3);
    const s = Math.sin((2 * Math.PI * f * i) / SR) * env * 0.05;
    L[i] += s;
    R[i] += s;
  }
}

// 鈴の音：2〜4秒おきに和音の音を1オクターブ上で、短く柔らかく
for (let t = 1; t < seconds - 2; t += 2 + rnd() * 2) {
  const chord = CHORDS[Math.floor(t / CHORD_SEC) % CHORDS.length];
  const note = chord[Math.floor(rnd() * chord.length)] + 12;
  const f = midi(note);
  const pan = 0.3 + rnd() * 0.4;
  const a0 = Math.round(t * SR);
  const a1 = Math.min(N, a0 + SR * 3);
  for (let i = a0; i < a1; i++) {
    const u = (i - a0) / SR;
    const env = Math.min(1, u / 0.02) * Math.exp(-u * 1.6);
    const s = (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(2 * Math.PI * 2 * f * u) * Math.exp(-u * 3)) * env * 0.03;
    L[i] += s * (1 - pan);
    R[i] += s * pan;
  }
}

// 簡単な残響（遅れた音を小さく重ねる）とローパス、最初と最後のフェード
const delays = [0.21, 0.37, 0.53].map((d) => Math.round(d * SR));
for (const ch of [L, R]) {
  for (let i = N - 1; i >= 0; i--) for (const [k, d] of delays.entries()) if (i - d >= 0) ch[i] += ch[i - d] * (0.22 - k * 0.05);
  let y = 0;
  for (let i = 0; i < N; i++) ch[i] = y += (ch[i] - y) * 0.18;
  for (let i = 0; i < N; i++) ch[i] *= Math.min(1, i / (SR * 3), (N - i) / (SR * 4));
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const gain = 0.5 / Math.max(1e-9, peak); // ピーク -6 dBFS

const dir = path.join(ROOT, "_shared", "bgm");
fs.mkdirSync(dir, { recursive: true });
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain)) * 32767), 46 + i * 4);
}
const wav = path.join(dir, `${name}.wav`);
fs.writeFileSync(wav, buf);
fs.writeFileSync(
  path.join(dir, `${name}.json`),
  JSON.stringify({ name, file: `_shared/bgm/${name}.wav`, seconds, sampleRate: SR, generator: "short-movie/scripts/make-bgm.mjs", license: "自作の生成音源（外部の曲・サンプルを使っていない）。著作権の制限なく使える。クレジット不要", createdAt: new Date().toISOString() }, null, 2) + "\n",
);
console.log(`wrote ${path.relative(ROOT, wav)}（${seconds} 秒）`);
