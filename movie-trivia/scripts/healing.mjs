// @ts-check
// ヒーリング音楽の長尺（content-ops の制作の種類 healing-long・template healing-01、2026-11-23、セット02 つぐみの開運チャンネル）。
// 語りなし：神秘的な実写（Pexels の映像）をゆっくり・紺〜紫〜金の色味・やわらかな発光でつなぎ、自作の生成音源（コードで作る曲）を流す。
// 長尺（50分前後）は remotion の1コマずつの描画では時間がかかりすぎるので、映像の組み立ては ffmpeg で行う。
// サムネイルは共通remotion の Thumbnail（script.json の thumbnails[]、"layout": "mystic"）。動画フォルダは mt.mjs new の pattern-02 の箱を使う
// （script.json はサムネイルと素材の検索語だけに使う。動画の中身は input/healing.json）。説明：PRODUCTION-HANDOFF.md「healing-long」
//
//   node scripts/healing.mjs new    --project=<id>                 動画フォルダ（mt.mjs new）＋ input/healing.json の雛形
//   node scripts/healing.mjs music  --project=<id> [--force]       audio/music.wav（healing.json の durationSec。楽章ごとに調・響きを変える）
//   node scripts/healing.mjs render --project=<id> [--force]       output/<id>.mp4（場面ごとに映像を整え、溶かしてつなぎ、曲を重ねる。関所を通す）
//   node scripts/healing.mjs frames --project=<id>                 intermediate/review/（目視の確認用のコマ。場面ごと＋一覧）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { movieTrivia } from "./lib/engine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectsRoot = () => path.resolve(process.env.MOVIE_TRIVIA_PROJECTS_ROOT ?? ROOT);
export const HEALING_TEMPLATE = "healing-01";

/** @param {string} id */
export function healingFiles(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`--project は kebab-case です（${id}）`);
  const dir = path.join(projectsRoot(), id);
  return {
    dir,
    healing: path.join(dir, "input", "healing.json"),
    script: path.join(dir, "input", "script.json"),
    ledger: path.join(dir, "assets", "asset-sources.json"),
    assets: path.join(dir, "assets"),
    music: path.join(dir, "audio", "music.wav"),
    work: path.join(dir, "intermediate", "healing"),
    review: path.join(dir, "intermediate", "review"),
    mp4: path.join(dir, "output", `${id}.mp4`),
  };
}

const readJson = (/** @type {string} */ f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** ffmpeg / ffprobe を実行（失敗したら止める）。 @param {string} bin @param {string[]} args */
function run(bin, args, quiet = true) {
  const r = spawnSync(bin, quiet ? ["-hide_banner", "-loglevel", "error", ...args] : args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${bin} が失敗しました: ${r.stderr.toString().slice(-1500)}`);
  return r.stdout.toString();
}
const duration = (/** @type {string} */ f) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], false).trim());

// ---------------------------------------------------------------- healing.json

/**
 * healing.json の確認（validate・render の前）。
 * @param {any} h
 * @returns {string[]}
 */
export function healingIssues(h) {
  const issues = [];
  if (!h || typeof h !== "object") return ["healing.json の形が違います"];
  if (h.template !== HEALING_TEMPLATE) issues.push(`template が ${h.template}（${HEALING_TEMPLATE}）`);
  if (typeof h.title !== "string" || !h.title.trim()) issues.push("title がありません");
  if (!(h.durationSec >= 600 && h.durationSec <= 7200)) issues.push("durationSec は 600〜7200 秒");
  if (!Array.isArray(h.scenes) || h.scenes.length === 0) return [...issues, "scenes がありません"];
  const fade = h.fadeSec ?? 6;
  const total = h.scenes.reduce((a, /** @type {any} */ s) => a + s.seconds, 0) - fade * (h.scenes.length - 1);
  if (Math.abs(total - h.durationSec) > h.durationSec * 0.03) issues.push(`場面の合計 ${Math.round(total)} 秒（溶かしの重なりを除く）が durationSec ${h.durationSec} 秒と合わない（±3%）`);
  h.scenes.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (typeof s.footage !== "string") issues.push(`scenes[${i}]：footage がない`);
    if (!(s.seconds >= 60 && s.seconds <= 300)) issues.push(`scenes[${i}]：seconds は 60〜300（同じ画を長く続けない）`);
    if (i > 0 && h.scenes[i - 1].footage === s.footage) issues.push(`scenes[${i}]：前の場面と同じ映像（${s.footage}）`);
  });
  issues.push(...claimIssues(`${h.title}\n${h.description ?? ""}`));
  return issues;
}

/** 効果の断定・強い煽り（set02 のルール。タイトル・概要欄）。 */
export const BANNED_CLAIMS = [
  [/警告|注意⚠|⚠/u, "警告などの強い煽り"],
  [/必ず|絶対|確実に|100%|１００％/u, "必ず・絶対などの断定"],
  [/治る|治す|治ります|効く|効きます|効果があ|改善しま/u, "体・心への効果の断定"],
  [/叶います|叶う音|叶えます|引き寄せます|運気が(上が|動き)|金運が上が/u, "運・願いへの効果の断定"],
  [/\d+\s*人中|\d+\s*人に\s*\d+\s*人/u, "「100人中97人」などの根拠のない数字"],
  [/\d+\s*(hz|Hz|HZ|ヘルツ)/u, "周波数の効能"],
  [/見逃さ|自己責任|特殊能力|覚醒|奇跡/u, "見逃し厳禁・自己責任・覚醒などの煽り"],
];
/** @param {string} text */
export function claimIssues(text) {
  return BANNED_CLAIMS.filter(([re]) => /** @type {RegExp} */ (re).test(text)).map(([, what]) => `タイトル・概要欄に${what}があります`);
}

// ---------------------------------------------------------------- new

/** @param {string} id */
async function cmdNew(id) {
  const code = await movieTrivia.runMovieTriviaCli(["new", `--project=${id}`, "--pattern=pattern-02"]);
  if (code) return code;
  const f = healingFiles(id);
  const h = {
    template: HEALING_TEMPLATE,
    title: "（YouTube のタイトルと同じ。効果の断定・煽りをしない）",
    description: "",
    durationSec: 3000,
    fadeSec: 6,
    speed: 0.6,
    music: { seed: 20261123, movementSec: 300 },
    scenes: [{ footage: "<script.json の media のキー>", seconds: 180 }],
  };
  fs.writeFileSync(f.healing, `${JSON.stringify(h, null, 2)}\n`, { flag: "wx" });
  console.log(`made   ${id}/input/healing.json（scenes・title を書く。映像の検索語は script.json の media に { "<key>": { "query": "..." } }、サムネイルは thumbnails[] の "layout": "mystic"）`);
  return 0;
}

// ---------------------------------------------------------------- music

const SR = 48000;
const midi = (/** @type {number} */ m) => 440 * 2 ** ((m - 69) / 12);

/** 楽章の和音進行（ルートからの半音。どれもやわらかい長調・旋法）。 */
const PROGRESSIONS = [
  [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [7, 11, 14, 17]], // Imaj7 – vi – IVmaj7 – V7sus 的
  [[0, 4, 7, 14], [5, 9, 12, 16], [2, 5, 9, 12], [5, 9, 12, 16]], // Iadd9 – IVmaj7 – ii7 – IV
  [[0, 7, 11, 16], [-2, 5, 9, 14], [-5, 2, 7, 11], [0, 7, 11, 16]], // 開いた響き
  [[0, 4, 9, 14], [-3, 4, 7, 12], [-7, 0, 4, 9], [-5, 2, 7, 11]], // I6/9 – vi – IV – V
];
/** 楽章ごとのルート（MIDI）。ゆっくり転調していく。 */
const ROOTS = [53, 55, 50, 52, 48, 53, 57, 55, 50, 52, 48, 53];

/**
 * 1楽章の音（ステレオの Float32）。パッド（倍音を少し足した和音、ゆっくりした揺れ）＋低音＋鈴（非整数倍音の柔らかい減衰）＋かすかな風の音、簡単な残響。
 * @param {number} seconds @param {number} m 楽章の番号 @param {() => number} rnd
 */
function movement(seconds, m, rnd) {
  const N = Math.round(seconds * SR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  const root = ROOTS[m % ROOTS.length];
  const prog = PROGRESSIONS[m % PROGRESSIONS.length];
  const chordSec = 10 + (m % 3) * 2; // 10・12・14 秒
  const bright = 0.12 + (m % 4) * 0.04; // 倍音の量（楽章ごとに響きを変える）
  // パッド
  for (let ci = 0; ci * chordSec < seconds + chordSec; ci++) {
    const chord = prog[ci % prog.length];
    const t0 = ci * chordSec - 2;
    const len = chordSec + 4;
    const a0 = Math.max(0, Math.round(t0 * SR));
    const a1 = Math.min(N, Math.round((t0 + len) * SR));
    for (const [ni, iv] of chord.entries()) {
      for (const det of [-0.08, 0.08]) {
        const f = midi(root + iv) * 2 ** (det / 12);
        const pan = 0.5 + (ni - 1.5) * 0.14 + det * 1.5;
        let ph = rnd() * Math.PI * 2;
        const lfo = 0.07 + rnd() * 0.08;
        for (let i = a0; i < a1; i++) {
          const t = i / SR - t0;
          const env = Math.min(1, t / 3.5) * Math.min(1, (len - t) / 3.5);
          const wob = 1 + 0.18 * Math.sin(2 * Math.PI * lfo * (i / SR) + ni);
          const s = (Math.sin(ph) + bright * Math.sin(2 * ph) + bright * 0.4 * Math.sin(3 * ph)) * env * wob * 0.026;
          ph += (2 * Math.PI * f) / SR;
          L[i] += s * (1 - pan);
          R[i] += s * pan;
        }
      }
    }
    // 低音
    const fb = midi(root + chord[0] - 12);
    for (let i = a0; i < a1; i++) {
      const t = i / SR - t0;
      const env = Math.min(1, t / 4) * Math.min(1, (len - t) / 4);
      const s = Math.sin((2 * Math.PI * fb * i) / SR) * env * 0.05;
      L[i] += s;
      R[i] += s;
    }
  }
  // 鈴（和音の音を1〜2オクターブ上で。間隔は楽章ごとに変える）
  const gapMin = 2.5 + (m % 3);
  for (let t = 1 + rnd() * 2; t < seconds - 4; t += gapMin + rnd() * 3) {
    const chord = prog[Math.floor(t / chordSec) % prog.length];
    const f = midi(root + chord[Math.floor(rnd() * chord.length)] + (rnd() < 0.35 ? 24 : 12));
    const pan = 0.25 + rnd() * 0.5;
    const vol = 0.022 + rnd() * 0.018;
    const a0 = Math.round(t * SR);
    const a1 = Math.min(N, a0 + SR * 5);
    for (let i = a0; i < a1; i++) {
      const tt = (i - a0) / SR;
      const env = Math.min(1, tt / 0.01) * Math.exp(-tt * 1.1);
      const s = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * tt) * Math.exp(-tt * 2.5)) * env * vol;
      L[i] += s * (1 - pan);
      R[i] += s * pan;
    }
  }
  // かすかな風（ローパスしたノイズ、ゆっくり強弱）
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < N; i++) {
    lp += 0.02 * (rnd() * 2 - 1 - lp);
    lp2 += 0.02 * (lp - lp2);
    const sw = 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / SR / 23 + m);
    const s = lp2 * 0.06 * sw;
    L[i] += s;
    R[i] += s * 0.9;
  }
  // 残響（左右で長さの違う帰還つき遅延を数本）
  for (const [buf, delays] of /** @type {[Float32Array, number[]][]} */ ([[L, [0.0297, 0.0371, 0.0411, 0.0437]], [R, [0.0311, 0.0353, 0.0423, 0.0449]]])) {
    const src = Float32Array.from(buf);
    for (const d of delays) {
      const n = Math.round(d * SR * 7);
      const g = 0.42;
      const comb = new Float32Array(N);
      for (let i = 0; i < N; i++) comb[i] = src[i] + (i >= n ? comb[i - n] * g : 0);
      for (let i = 0; i < N; i++) buf[i] += comb[i] * 0.09;
    }
  }
  return { L, R };
}

/** @param {string} file @param {Float32Array} L @param {Float32Array} R */
function writeWav(file, L, R) {
  const N = L.length;
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
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0.9 ? 0.9 / peak : 1;
  for (let i = 0; i < N; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

/** @param {string} id @param {boolean} force */
function cmdMusic(id, force) {
  const f = healingFiles(id);
  const h = readJson(f.healing);
  if (fs.existsSync(f.music) && !force) throw new Error(`${id}/audio/music.wav があります（--force で作り直す）`);
  const total = h.durationSec + 2;
  const xf = 8;
  const per = h.music?.movementSec ?? 300;
  const count = Math.ceil((total - xf) / (per - xf));
  const movementSec = (total + xf * (count - 1)) / count;
  let seed = h.music?.seed ?? 20261123;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dir = path.join(f.work, "music");
  fs.mkdirSync(dir, { recursive: true });
  const parts = [];
  for (let m = 0; m < count; m++) {
    const { L, R } = movement(movementSec, m, rnd);
    const p = path.join(dir, `m${String(m + 1).padStart(2, "0")}.wav`);
    writeWav(p, L, R);
    parts.push(p);
    process.stdout.write(`\r楽章 ${m + 1}/${count}`);
  }
  console.log("");
  // 楽章を重ねて溶かし、全体をゆっくり始めて終える。音量は -18 LUFS・True Peak -2 dB
  const inputs = parts.flatMap((p) => ["-i", p]);
  let chain = "";
  let last = "[0:a]";
  for (let i = 1; i < parts.length; i++) {
    const out = i === parts.length - 1 ? "[mix]" : `[x${i}]`;
    chain += `${last}[${i}:a]acrossfade=d=${xf}:c1=qsin:c2=qsin${out};`;
    last = out;
  }
  if (parts.length === 1) chain = "[0:a]anull[mix];";
  const fadeOut = h.durationSec - 8;
  chain += `[mix]atrim=0:${h.durationSec},afade=t=in:d=6,afade=t=out:st=${fadeOut}:d=8,loudnorm=I=-18:TP=-2:LRA=7[out]`;
  fs.mkdirSync(path.dirname(f.music), { recursive: true });
  run("ffmpeg", ["-y", ...inputs, "-filter_complex", chain, "-map", "[out]", "-ar", String(SR), "-c:a", "pcm_s16le", f.music]);
  fs.writeFileSync(
    path.join(path.dirname(f.music), "music.json"),
    `${JSON.stringify({ file: "audio/music.wav", seconds: h.durationSec, movements: count, movementSec: Math.round(movementSec), seed: h.music?.seed ?? 20261123, generator: "movie-trivia/scripts/healing.mjs music", license: "自作の生成音源（外部の曲・サンプルを使っていない）。著作権の制限なく使える。クレジット不要", createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`wrote ${id}/audio/music.wav（${count} 楽章・${Math.round(duration(f.music))} 秒）`);
}

// ---------------------------------------------------------------- render

/** 色と光：影を紺、明るいところを少し金に、彩度を少し落とし、やわらかな発光と周辺減光。 */
const GRADE = "eq=saturation=0.82:brightness=-0.02:contrast=1.04,colorbalance=rs=-0.04:gs=-0.02:bs=0.10:rm=0.02:bm=0.05:rh=0.04:gh=-0.01:bh=0.02";
const GLOW = "split[g0][g1];[g1]gblur=sigma=22[g2];[g0][g2]blend=all_mode=screen:all_opacity=0.28,vignette=angle=PI/5";

/** @param {string} id @param {boolean} force */
async function cmdRender(id, force) {
  const f = healingFiles(id);
  const { main: production } = await import("./production.mjs");
  if ((await production(["gate", `--project=${id}`])) !== 0) throw new Error(`stopped: ${id} は制作依頼の関所を通っていません`);
  const h = readJson(f.healing);
  const issues = healingIssues(h);
  if (issues.length) throw new Error(`healing.json に問題があります:\n  - ${issues.join("\n  - ")}`);
  if (!fs.existsSync(f.music)) throw new Error(`${id}/audio/music.wav がありません（healing.mjs music が先）`);
  if (fs.existsSync(f.mp4) && !force) throw new Error(`${id}/output/${id}.mp4 があります（--force で作り直す）`);
  const ledger = readJson(f.ledger);
  const fade = h.fadeSec ?? 6;
  const speed = h.speed ?? 0.6;
  const dir = path.join(f.work, "scenes");
  fs.mkdirSync(dir, { recursive: true });
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-an"];
  const t0 = Date.now();
  const sceneFiles = [];
  for (const [i, s] of h.scenes.entries()) {
    const entry = ledger[s.footage];
    if (!entry || entry.mediaType !== "video") throw new Error(`scenes[${i}]：${s.footage} の映像が台帳にありません（mt.mjs pexels pick）`);
    const src = path.join(f.assets, entry.localFile);
    const sp = s.speed ?? speed;
    // 元の映像の使う長さ（遅くした後で 20〜30 秒になる程度）。前向き＋逆向きでつなぎ目のないループにする
    const take = Math.min(duration(src) - 0.2 - (s.start ?? 0), 24 * sp);
    const fwd = path.join(dir, `s${i + 1}-fwd.mp4`);
    const rev = path.join(dir, `s${i + 1}-rev.mp4`);
    const out = path.join(dir, `s${i + 1}.mp4`);
    const vf = `trim=start=${s.start ?? 0}:duration=${take},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setpts=PTS/${sp},minterpolate=fps=30:mi_mode=blend,${GRADE},${GLOW}`;
    run("ffmpeg", ["-y", "-i", src, "-filter_complex", `[0:v]${vf}[v]`, "-map", "[v]", ...enc, fwd]);
    // 逆向き：メモリを使いすぎないよう 4 秒ずつ逆にして、逆の順につなぐ
    const fl = duration(fwd);
    const pieces = [];
    for (let k = 0; k * 4 < fl - 0.05; k++) {
      const piece = path.join(dir, `s${i + 1}-r${k}.mp4`);
      run("ffmpeg", ["-y", "-ss", String(k * 4), "-t", "4", "-i", fwd, "-vf", "reverse", ...enc, piece]);
      pieces.unshift(path.basename(piece));
    }
    const rlist = path.join(dir, `s${i + 1}-rev.txt`);
    fs.writeFileSync(rlist, pieces.map((p) => `file '${p}'\n`).join(""));
    run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", rlist, "-c", "copy", rev]);
    const list = path.join(dir, `s${i + 1}.txt`);
    const loopLen = duration(fwd) * 2;
    const reps = Math.ceil(s.seconds / loopLen) + 1;
    fs.writeFileSync(list, Array.from({ length: reps }, () => `file '${path.basename(fwd)}'\nfile '${path.basename(rev)}'\n`).join(""));
    run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-t", String(s.seconds), "-c", "copy", out]);
    sceneFiles.push(out);
    process.stdout.write(`\r場面 ${i + 1}/${h.scenes.length}（${((Date.now() - t0) / 1000).toFixed(0)} 秒）`);
  }
  console.log("");
  // 場面を溶かしてつなぐ（暗転させない）＋曲
  let graph = "";
  let last = "[0:v]";
  let offset = 0;
  for (let i = 1; i < sceneFiles.length; i++) {
    offset += h.scenes[i - 1].seconds - fade;
    const out = `[v${i}]`;
    graph += `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset}${out};`;
    last = out;
  }
  const total = offset + h.scenes[h.scenes.length - 1].seconds;
  graph += `${last}fade=t=in:d=3,fade=t=out:st=${Math.min(total, h.durationSec) - 5}:d=5,format=yuv420p[vout]`;
  if (sceneFiles.length === 1) graph = graph.replace("[0:v]fade", "[0:v]fade");
  fs.mkdirSync(path.dirname(f.mp4), { recursive: true });
  const inputs = sceneFiles.flatMap((p) => ["-i", p]);
  const musicIdx = sceneFiles.length;
  run("ffmpeg", ["-y", ...inputs, "-i", f.music, "-filter_complex", graph, "-map", "[vout]", "-map", `${musicIdx}:a`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-t", String(h.durationSec), "-movflags", "+faststart", f.mp4]);
  console.log(`wrote ${id}/output/${id}.mp4（${Math.round(duration(f.mp4))} 秒・${((Date.now() - t0) / 60000).toFixed(1)} 分）`);
}

// ---------------------------------------------------------------- frames

/** @param {string} id */
function cmdFrames(id) {
  const f = healingFiles(id);
  const h = readJson(f.healing);
  fs.rmSync(f.review, { recursive: true, force: true });
  fs.mkdirSync(f.review, { recursive: true });
  const fade = h.fadeSec ?? 6;
  let start = 0;
  const shots = [];
  for (const [i, s] of h.scenes.entries()) {
    const t = start + s.seconds / 2;
    const out = path.join(f.review, `scene${String(i + 1).padStart(2, "0")}.jpg`);
    run("ffmpeg", ["-y", "-ss", String(t), "-i", f.mp4, "-frames:v", "1", "-vf", "scale=640:-2", out]);
    shots.push(out);
    start += s.seconds - fade;
  }
  const cols = 4;
  run("ffmpeg", ["-y", "-i", path.join(f.review, "scene%02d.jpg"), "-vf", `tile=${cols}x${Math.ceil(shots.length / cols)}:padding=6:color=black`, "-frames:v", "1", path.join(f.review, "sheet.jpg")]);
  console.log(`wrote ${id}/intermediate/review/（場面ごと ${shots.length} 枚＋ sheet.jpg）`);
}

// ---------------------------------------------------------------- main

/** @param {string[]} argv */
export async function main(argv) {
  const [cmd, ...rest] = argv;
  const o = Object.fromEntries(rest.map((a) => a.replace(/^--/, "").split(/=(.*)/s).slice(0, 2)).map(([k, v]) => [k, v ?? "true"]));
  const id = o.project;
  if (!cmd || !id) {
    console.log("node scripts/healing.mjs new|music|render|frames --project=<id> [--force]");
    return 1;
  }
  if (cmd === "new") return cmdNew(id);
  if (cmd === "music") return cmdMusic(id, o.force === "true"), 0;
  if (cmd === "render") return await cmdRender(id, o.force === "true"), 0;
  if (cmd === "frames") return cmdFrames(id), 0;
  throw new Error(`不明なコマンド ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (c) => (process.exitCode = c),
    (e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    },
  );
}
