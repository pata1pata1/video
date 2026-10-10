// Design check: stills of intermediate/cut.mp4 with the approved subtitles in the
// current preset, rendered by Remotion (the same component the final render will use).
//   npm run subtitle-stills -- --project=<id> [--cues=s010,s002,s044,s056]（4つなら 1行・2行・長い・短い の順）
//     [--variant=<name>]  review/subtitle-design/<name>/style.json を preset に重ねた比較案
//     [--out=<folder>]    出力先 review/subtitle-design/<folder>/（任意の字幕を確認する時。default との比較画像は作らない）
// → review/subtitle-design/*.png and sheet.png (2×2). No video is rendered.
//   With --variant: review/subtitle-design/<name>/*.png, and compare/ (default | variant,
//   per scene and all.png) when the default stills of the same scenes exist.
//   A preset with layout.lineBreak "fit-width" re-lays out every cue (one line unless it does not
//   fit the width) and writes <out>/layout.json; the approved text is not changed.

import fs from "node:fs";
import path from "node:path";
import type { ProbeJson } from "../src/analyze.ts";
import { fmtTime, parseArgs, runCli, UserError } from "../src/cli.ts";
import { runTool } from "../src/engine.ts";
import { assertWritable, loadProject, readJson, readJsonIfExists } from "../src/project.ts";
import { bundleCompositions, measureTextEm, renderStillPng } from "../src/render.ts";
import { effectiveCues, layoutCues, loadPreset, mergePreset, loadSubtitleEdits, textWidth, type SubtitleDraft } from "../src/subtitles.ts";
import { resolvePreset, type SubtitlePreset } from "../remotion/presetMath.ts";

await runCli(async () => {
  const args = parseArgs();
  const project = loadProject(args.get("project"));
  const { paths, json } = project;
  assertWritable(project);
  const draft = readJsonIfExists<SubtitleDraft>(paths.subtitlesDraft);
  if (!draft) throw new UserError("字幕案がありません（npm run subtitles -- draft）。");
  const edits = loadSubtitleEdits(paths, json.id);
  if (!edits.approved || edits.approved.draftFingerprint !== draft.fingerprint) console.log("！ 字幕はまだ承認されていません（確認用として続けます）。");
  const cues = effectiveCues(draft, edits);
  const designDir = path.join(paths.review, "subtitle-design");
  const variant = args.get("variant");
  const preset = (() => {
    const base = loadPreset(paths);
    if (!variant) return base;
    const file = path.join(designDir, variant, "style.json");
    if (!fs.existsSync(file)) throw new UserError(`比較案の設定がありません: ${path.relative(paths.root, file)}`);
    return mergePreset(base, { ...readJson<Partial<SubtitlePreset>>(file), name: variant });
  })();
  const probe = readJson<ProbeJson>(paths.probe);
  const report = readJson<{ rotation: { width: number; height: number } }>(paths.cutFinal.replace(/\.mp4$/, ".report.json"));
  const { width, height } = report.rotation; // cut.mp4 is upright
  void probe;

  // Scenes: widest one-line, a typical two-line, the longest text, the shortest text.
  const lines = (c: (typeof cues)[number]) => c.text.split("\n");
  const len = (c: (typeof cues)[number]) => textWidth(c.text.replace(/\n/g, ""));
  const pick = (cands: typeof cues, by: (c: (typeof cues)[number]) => number) => [...cands].sort((a, b) => by(b) - by(a))[0];
  const chosen = args.get("cues")
    ? args.all("cues", true).map((id, i, all) => ({ kind: all.length === 4 && !args.get("out") ? ["1行", "2行", "長い字幕", "短い字幕"][i] : "", cue: cues.find((c) => c.id === id) ?? (() => { throw new UserError(`${id} がありません。`); })() }))
    : (() => {
        const one = pick(cues.filter((c) => lines(c).length === 1), len);
        const longest = pick(cues, len);
        const twoCands = cues.filter((c) => lines(c).length === 2 && c !== longest);
        const avg = twoCands.reduce((n, c) => n + len(c), 0) / twoCands.length;
        const two = pick(twoCands, (c) => -Math.abs(len(c) - avg));
        const short = pick(cues.filter((c) => c.end - c.start >= 0.8), (c) => -len(c));
        return [
          { kind: "1行", cue: one },
          { kind: "2行", cue: two },
          { kind: "長い字幕", cue: longest },
          { kind: "短い字幕", cue: short },
        ];
      })();

  const outDir = args.get("out") ? path.join(designDir, args.get("out")!) : variant ? path.join(designDir, variant) : designDir;
  const r = resolvePreset(preset, width, height);

  // Lines as they would be burned in.
  const shown = new Map<string, string>();
  if (preset.layout.lineBreak === "fit-width") {
    const layout = await layoutCues(cues, r, preset.layout.maxLines, (t) => measureTextEm(t, preset.font));
    for (const l of layout) shown.set(l.id, l.lines.join("\n"));
    const two = layout.filter((l) => l.lines.length === 2);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "layout.json"), JSON.stringify({ preset: preset.name, width, height, fontSizePx: r.fontSize, maxWidthPx: r.maxWidth, oneLine: layout.length - two.length, twoLines: two.length, cues: layout.map((l) => ({ ...l, oneLinePx: Math.round(l.oneLinePx) })) }, null, 2) + "\n");
    console.log(`再レイアウト（1行が基本）: 1行 ${layout.length - two.length} 件／2行 ${two.length} 件 → ${path.relative(paths.root, path.join(outDir, "layout.json"))}`);
    for (const l of two) console.log(`  ${l.id}  ${l.reason}  「${l.lines.join(" ／ ")}」`);
  }
  const textOf = (c: (typeof cues)[number]) => shown.get(c.id) ?? c.text;
  const stage = path.join(paths.intermediate, "render-public");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log("cut.mp4 からフレームを取り出し中…");
  for (const [i, s] of chosen.entries()) {
    // Show the moment the cue is on screen and the speaker is mid-phrase.
    const t = s.cue.start + Math.min(0.6, (s.cue.end - s.cue.start) / 2);
    await runTool("ffmpeg", ["-v", "error", "-ss", t.toFixed(3), "-i", paths.cutFinal, "-frames:v", "1", "-y", path.join(stage, `frame-${i + 1}.png`)]);
    Object.assign(s, { t });
  }

  console.log("Remotion で描画中（bundle）…");
  const serveUrl = await bundleCompositions(stage);
  const outputs: string[] = [];
  for (const [i, s] of chosen.entries()) {
    const file = path.join(outDir, `${i + 1}-${s.kind ? `${s.kind}-` : ""}${s.cue.id}.png`);
    await renderStillPng(serveUrl, "SubtitleStill", { frame: `frame-${i + 1}.png`, text: textOf(s.cue), preset, width, height }, file);
    outputs.push(file);
    const t = (s as unknown as { t: number }).t;
    console.log(`  ${path.relative(paths.root, file)}  ${s.cue.id}  cut.mp4 ${fmtTime(t)}（字幕 ${fmtTime(s.cue.start)}–${fmtTime(s.cue.end)}）「${textOf(s.cue).replace(/\n/g, " ／ ")}」`);
  }

  // Sheet of all stills, two per row at half size, each labelled with the cue id and time.
  const font = "C\\:/Windows/Fonts/meiryob.ttc"; // the colon escaped for the filtergraph
  const tag = (text: string, size: number) =>
    `drawtext=fontfile='${font}':text='${text.replace(/:/g, "\\:")}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=${Math.round(size / 3)}:x=${size}:y=${size}`;
  if (outputs.length >= 2) {
    const sheet = path.join(outDir, "sheet.png");
    const n = outputs.length;
    const tiles = chosen.map((c, i) => `[${i}]scale=iw/2:-1,${tag(`${c.cue.id}  ${fmtTime((c as unknown as { t: number }).t)}`, 26)}[t${i}]`);
    const pos = (i: number) => `${i % 2 ? "w0" : "0"}_${Math.floor(i / 2) ? Array(Math.floor(i / 2)).fill("h0").join("+") : "0"}`;
    await runTool("ffmpeg", [
      "-v", "error",
      ...outputs.flatMap((f) => ["-i", f]),
      "-filter_complex",
      `${tiles.join(";")};${chosen.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${n}:layout=${Array.from({ length: n }, (_, i) => pos(i)).join("|")}:fill=black`,
      "-y", sheet,
    ]);
    console.log(`  ${path.relative(paths.root, sheet)}（${n}枚を並べたもの）`);
  }
  fs.rmSync(stage, { recursive: true, force: true });

  // default | variant, side by side with labels (the default stills come from a run without --variant).
  if (variant && !args.get("out")) {
    const pairs = outputs.map((f, i) => ({ a: path.join(designDir, path.basename(f)), b: f, label: `${chosen[i].kind} ${chosen[i].cue.id}` }));
    const missing = pairs.filter((p) => !fs.existsSync(p.a));
    if (missing.length) {
      console.log(`！ default の静止画が無いため比較画像は作りません（先に --variant なしで同じ --cues を実行）: ${missing.map((p) => path.basename(p.a)).join(", ")}`);
    } else {
      const cmpDir = path.join(designDir, `compare-${variant}`);
      fs.mkdirSync(cmpDir, { recursive: true });
      for (const p of pairs) {
        const file = path.join(cmpDir, path.basename(p.b));
        await runTool("ffmpeg", ["-v", "error", "-i", p.a, "-i", p.b, "-filter_complex",
          `[0]${tag(`default  ${p.label}`, 40)}[a];[1]${tag(`${variant}  ${p.label}`, 40)}[b];[a][b]hstack=inputs=2`, "-y", file]);
        console.log(`  ${path.relative(paths.root, file)}（左 default／右 ${variant}）`);
      }
      const all = path.join(cmpDir, "all.png");
      const tiles = pairs.flatMap((p, i) => [
        `[${2 * i}]scale=iw/2:-1,${tag(`default  ${p.label}`, 26)}[a${i}]`,
        `[${2 * i + 1}]scale=iw/2:-1,${tag(`${variant}  ${p.label}`, 26)}[b${i}]`,
      ]);
      const rows = pairs.map((_, i) => (i === 0 ? "0" : Array(i).fill("h0").join("+")));
      const layout = rows.flatMap((y) => [`0_${y}`, `w0_${y}`]).join("|");
      await runTool("ffmpeg", ["-v", "error", ...pairs.flatMap((p) => ["-i", p.a, "-i", p.b]), "-filter_complex",
        `${tiles.join(";")};${pairs.map((_, i) => `[a${i}][b${i}]`).join("")}xstack=inputs=${pairs.length * 2}:layout=${layout}`, "-y", all]);
      console.log(`  ${path.relative(paths.root, all)}（全場面：左 default／右 ${variant}）`);
    }
  }

  console.log(`\npreset: ${preset.name}  画面 ${width}×${height}（短辺 ${r.short}px）`);
  console.log(`  フォント ${preset.font.family} ${preset.font.weight}／文字 ${r.fontSize.toFixed(1)}px（短辺の ${preset.font.sizeRatio}）／縁取り ${r.strokeWidth.toFixed(1)}px（文字の ${preset.stroke.widthRatio}）`);
  console.log(`  下から ${r.margin.toFixed(1)}px（短辺の ${preset.position.marginRatio}）／行間 ${preset.font.lineHeight}（${r.lineHeightPx.toFixed(1)}px）／最大幅 ${r.maxWidth.toFixed(0)}px（幅の ${preset.position.maxWidthRatio}）`);
});
