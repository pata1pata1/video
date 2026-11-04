// Evaluation: how well the current cut-candidate defaults reproduce the user's own edit of a
// video (docs/design.md §15「検証」). Input is a reference project (source + the user's final,
// reconstructed by `npm run reference -- reconstruct`). Candidates are built in memory exactly as
// phase1 (and round 2, `candidates --append-retakes`) would build them, then compared with the
// ranges the user actually removed, on the source timeline.
//
// Read-only for the project: nothing in projects/<id>/ is written (no cut-candidates.json, no
// decisions). The result goes to style-data/trials/<id>.json, which the learning never reads.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ProbeJson } from "../analyze.ts";
import { readPcmWav } from "../audioLevel.ts";
import { buildCutCandidates, CUT_KIND_LABELS, pausePadding, type CutCandidate, type CutKind } from "../candidates.ts";
import { fmtTime, UserError } from "../cli.ts";
import { loadSettings } from "../config.ts";
import { STYLE_TRIALS_DIR, TOOL_ROOT } from "../paths.ts";
import { fingerprint, readJson, readJsonIfExists, type Project } from "../project.ts";
import { round2Drafts, unionRanges } from "../steps.ts";
import type { Transcript } from "../transcript.ts";
import type { Reconstruction } from "./reconstruct.ts";

type Range = { start: number; end: number };

/** A removed range with at least this much voiced source audio counts as "speech" (same as observe). */
const SPEECH_SECONDS = 0.15;
/** A user removal counts as found when proposals cover at least this share of it. */
const FOUND_SHARE = 0.5;
/** A cut proposal is a false cut when at least this much of it lies in what the user kept. */
const FALSE_CUT_SECONDS = 0.3;

export type TrialMetrics = {
  candidates: number;
  cutProposals: number;
  reviewOnly: number;
  cutSeconds: number;
  reviewSeconds: number;
  /** Of the time proposed for cutting, the share the user also removed. */
  precision: number | null;
  /** Of the time the user removed, the share covered by cut proposals / by cut + review. */
  recall: number;
  recallWithReview: number;
  /** Share of the source timeline where "cut proposal" and "user removed" agree. */
  timeAgreement: number;
  /** Source length minus the cut proposals (what the video would be if every proposal were accepted). */
  predictedSeconds: number;
  /** User removals that contain speech (retakes, fillers, tangents…): how many were found. */
  speechRemovals: { count: number; seconds: number; foundByCut: number; foundWithReview: number; coveredSecondsByCut: number };
  /** User removals that are only pause. */
  pauseRemovals: { count: number; seconds: number; coveredSecondsByCut: number };
  byKind: { kind: CutKind; suggestion: "cut" | "review"; count: number; seconds: number; userAlsoRemoved: number | null }[];
};

export type Trial = {
  version: 1;
  kind: "trial";
  id: string;
  createdAt: string;
  /** true: the video was used for learning (ref-landscape-001…), so the numbers are optimistic. */
  inSample: boolean;
  tool: { commit: string | null; settingsFingerprint: string; projectSettings: boolean; sentencePauseSeconds: number; phrasePauseSeconds: number };
  video: {
    sourceSeconds: number;
    finalSeconds: number;
    userRemovedSeconds: number;
    userRemovals: number;
    userCutsPerMinute: number;
    /** Reconstruction quality: share of the final's speech placed in the source (below ~0.95 the comparison is rough). */
    matchedSpeechRatio: number;
    reordered: boolean;
  };
  /** phase1: the candidates `npm run phase1` makes. withRound2: plus `candidates --append-retakes`. */
  phase1: TrialMetrics;
  withRound2: TrialMetrics;
  openingRetakes: { start: number; end: number; suggestion: "cut" | "review"; userAlsoRemoved: number }[];
  /** Pauses heard in the final at a cut (median seconds): the user's choice vs the tool's targets. */
  pausesAtCuts: { count: number; medianSeconds: number | null };
  /** Speech removals the proposals (cut + review, with round 2) do not find, longest first. */
  misses: { start: number; end: number; seconds: number; covered: number; text: string; before: string; after: string }[];
  /** Cut proposals (with round 2) over what the user kept, longest first. */
  falseCuts: { kind: CutKind; start: number; end: number; keptSeconds: number; text: string; reason: string; round: 1 | 2 }[];
};

export const trialFile = (id: string) => path.join(STYLE_TRIALS_DIR, `${id}.json`);

const len = (rs: Range[]) => rs.reduce((n, r) => n + r.end - r.start, 0);
function overlapSeconds(a: Range[], b: Range[]): number {
  // both are sorted, non-overlapping unions
  let n = 0;
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j].end <= x.start) j++;
    for (let k = j; k < b.length && b[k].start < x.end; k++) n += Math.max(0, Math.min(x.end, b[k].end) - Math.max(x.start, b[k].start));
  }
  return n;
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const ratio = (a: number, b: number) => (b > 0 ? r3(a / b) : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function toolCommit(): string | null {
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: TOOL_ROOT, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "src", "scripts", "python"], { cwd: TOOL_ROOT, encoding: "utf8" }).trim();
    return dirty ? `${head}+changes` : head;
  } catch {
    return null;
  }
}

type Item = Pick<CutCandidate, "kind" | "start" | "end" | "suggestion" | "text" | "reason" | "detail"> & { round: 1 | 2 };

function metrics(items: Item[], removed: Reconstruction["removed"], user: Range[], duration: number): TrialMetrics {
  const cut = unionRanges(items.filter((c) => c.suggestion === "cut"));
  const any = unionRanges(items);
  const review = unionRanges(items.filter((c) => c.suggestion === "review"));
  const cutHit = overlapSeconds(cut, user);
  const userSec = len(user);
  const speech = removed.filter((r) => r.speechSeconds >= SPEECH_SECONDS);
  const pause = removed.filter((r) => r.speechSeconds < SPEECH_SECONDS);
  const cov = (r: Reconstruction["removed"][number], u: Range[]) => overlapSeconds([{ start: r.srcStart, end: r.srcEnd }], u);
  const kinds = new Map<string, Item[]>();
  for (const c of items) kinds.set(`${c.kind}/${c.suggestion}`, [...(kinds.get(`${c.kind}/${c.suggestion}`) ?? []), c]);
  return {
    candidates: items.length,
    cutProposals: items.filter((c) => c.suggestion === "cut").length,
    reviewOnly: items.filter((c) => c.suggestion === "review").length,
    cutSeconds: r3(len(cut)),
    reviewSeconds: r3(len(review)),
    precision: ratio(cutHit, len(cut)),
    recall: ratio(cutHit, userSec) ?? 0,
    recallWithReview: ratio(overlapSeconds(any, user), userSec) ?? 0,
    // agree where both cut, or neither: duration − (cut only) − (user only)
    timeAgreement: r3((duration - (len(cut) - cutHit) - (userSec - cutHit)) / duration),
    predictedSeconds: r3(duration - len(cut)),
    speechRemovals: {
      count: speech.length,
      seconds: r3(speech.reduce((n, r) => n + r.seconds, 0)),
      foundByCut: speech.filter((r) => cov(r, cut) >= FOUND_SHARE * r.seconds).length,
      foundWithReview: speech.filter((r) => cov(r, any) >= FOUND_SHARE * r.seconds).length,
      coveredSecondsByCut: r3(speech.reduce((n, r) => n + cov(r, cut), 0)),
    },
    pauseRemovals: {
      count: pause.length,
      seconds: r3(pause.reduce((n, r) => n + r.seconds, 0)),
      coveredSecondsByCut: r3(pause.reduce((n, r) => n + cov(r, cut), 0)),
    },
    byKind: [...kinds.entries()]
      .map(([k, cs]) => {
        const u = unionRanges(cs);
        return { kind: k.split("/")[0] as CutKind, suggestion: k.split("/")[1] as "cut" | "review", count: cs.length, seconds: r3(len(u)), userAlsoRemoved: ratio(overlapSeconds(u, user), len(u)) };
      })
      .sort((a, b) => b.seconds - a.seconds),
  };
}

export function evaluateProject(project: Project): Trial {
  const { paths, json } = project;
  const id = json.id;
  if (json.kind !== "reference") {
    throw new UserError(`案件 ${id} は reference ではありません。検証には元動画と、ユーザーが編集した完成動画が必要です（npm run new -- --id=… --kind=evaluation）。`);
  }
  const recon = readJsonIfExists<Reconstruction>(paths.reconstruction);
  if (!recon) throw new UserError(`reconstruction.json がまだありません（npm run reference -- all --project=${id}）。`);
  if (!fs.existsSync(paths.transcript) || !fs.existsSync(paths.audioWav)) throw new UserError(`元動画の文字起こし・音声がありません（npm run reference -- all --project=${id}）。`);
  if (json.reference && recon.source.sha256 !== json.reference.source.sha256) {
    throw new UserError(`reconstruction.json が今の元動画と合いません（npm run reference -- reconstruct --project=${id} をやり直してください）。`);
  }
  const transcript = readJson<Transcript>(paths.transcript);
  const probe = readJsonIfExists<ProbeJson>(paths.probe);
  const duration = recon.source.durationSeconds || probe?.durationSeconds || transcript.source.durationSeconds || 0;
  const settings = loadSettings(paths);
  const pcm = readPcmWav(paths.audioWav);

  // Same as phase1 (runCandidates) and `candidates --append-retakes` (appendRetakeCandidates, nothing approved yet).
  const built = buildCutCandidates(transcript, pcm, duration, settings.candidates);
  const r1: Item[] = built.items.map((c) => ({ ...c, round: 1 as const }));
  const cut1 = unionRanges(r1.filter((c) => c.suggestion === "cut"));
  const uncovered = (s: number, e: number) => e - s - overlapSeconds([{ start: s, end: e }], cut1);
  const r2: Item[] = round2Drafts(transcript, pcm, built.speechDb, settings.candidates, r1, uncovered).map((d) => ({ ...d, round: 2 as const }));
  const all = [...r1, ...r2].sort((a, b) => a.start - b.start);

  const user = unionRanges(recon.removed.map((r) => ({ start: r.srcStart, end: r.srcEnd })));
  const words = transcript.segments.flatMap((s) => s.words);
  const textIn = (s: number, e: number) => words.filter((w) => (w.start + w.end) / 2 >= s && (w.start + w.end) / 2 < e).map((w) => w.text).join("");
  const before = (t: number) => words.filter((w) => (w.start + w.end) / 2 < t).slice(-8).map((w) => w.text).join("");
  const after = (t: number) => words.filter((w) => (w.start + w.end) / 2 >= t).slice(0, 8).map((w) => w.text).join("");
  const anyAll = unionRanges(all);

  const misses = recon.removed
    .filter((r) => r.speechSeconds >= SPEECH_SECONDS)
    .map((r) => ({ r, covered: overlapSeconds([{ start: r.srcStart, end: r.srcEnd }], anyAll) }))
    .filter((x) => x.covered < FOUND_SHARE * x.r.seconds)
    .sort((a, b) => b.r.seconds - a.r.seconds)
    .map(({ r, covered }) => ({ start: r3(r.srcStart), end: r3(r.srcEnd), seconds: r3(r.seconds), covered: r3(covered / r.seconds), text: textIn(r.srcStart, r.srcEnd), before: before(r.srcStart), after: after(r.srcEnd) }));
  const falseCuts = all
    .filter((c) => c.suggestion === "cut")
    .map((c) => ({ c, kept: c.end - c.start - overlapSeconds([{ start: c.start, end: c.end }], user) }))
    .filter((x) => x.kept >= FALSE_CUT_SECONDS)
    .sort((a, b) => b.kept - a.kept)
    .map(({ c, kept }) => ({ kind: c.kind, start: r3(c.start), end: r3(c.end), keptSeconds: r3(kept), text: c.text, reason: c.reason, round: c.round }));

  const atCuts = recon.pauses.filter((p) => p.atCut && !p.edge).map((p) => p.seconds);
  return {
    version: 1,
    kind: "trial",
    id,
    createdAt: new Date().toISOString(),
    inSample: !json.learning?.exclude,
    tool: {
      commit: toolCommit(),
      settingsFingerprint: fingerprint(settings.candidates),
      projectSettings: fs.existsSync(paths.settings),
      sentencePauseSeconds: r3(2 * pausePadding(settings.candidates, true)),
      phrasePauseSeconds: r3(2 * pausePadding(settings.candidates, false)),
    },
    video: {
      sourceSeconds: r3(duration),
      finalSeconds: r3(recon.final.durationSeconds),
      userRemovedSeconds: r3(len(user)),
      userRemovals: recon.removed.length,
      userCutsPerMinute: recon.stats.cutsPerMinute,
      matchedSpeechRatio: recon.quality.matchedSpeechRatio,
      reordered: recon.quality.reordered,
    },
    phase1: metrics(r1, recon.removed, user, duration),
    withRound2: metrics(all, recon.removed, user, duration),
    openingRetakes: r1
      .filter((c) => c.detail?.pattern === "opening-retake")
      .map((c) => ({ start: c.start, end: c.end, suggestion: c.suggestion, userAlsoRemoved: ratio(overlapSeconds([{ start: c.start, end: c.end }], user), c.end - c.start) ?? 0 })),
    pausesAtCuts: { count: atCuts.length, medianSeconds: median(atCuts) === null ? null : r3(median(atCuts)!) },
    misses,
    falseCuts,
  };
}

// ---- console

const pct = (x: number | null) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);

export function printTrial(t: Trial, options: { list?: boolean; limit?: number } = {}) {
  const v = t.video;
  console.log(`検証: ${t.id}${t.inSample ? "（学習に使った動画。数字は甘めの参考値）" : "（学習に使っていない動画）"}`);
  console.log(`  ツール: ${t.tool.commit ?? "不明"}・${t.tool.projectSettings ? "案件の settings.json あり" : "既定値"}（文の区切り ${t.tool.sentencePauseSeconds}秒・句の途中 ${t.tool.phrasePauseSeconds}秒）`);
  console.log(`  あなたの編集: ${v.sourceSeconds.toFixed(1)}秒 → ${v.finalSeconds.toFixed(1)}秒（削除 ${v.userRemovals}区間 ${v.userRemovedSeconds.toFixed(1)}秒・${v.userCutsPerMinute}回／分）`);
  console.log(`  復元の精度: 話し声の ${pct(v.matchedSpeechRatio)}${v.matchedSpeechRatio < 0.95 ? "（低め。数字は目安）" : ""}${v.reordered ? "・並べ替えあり" : ""}`);
  for (const [label, m] of [["phase1 の候補", t.phase1], ["＋追加候補（--append-retakes）", t.withRound2]] as const) {
    console.log(`\n${label}: ${m.candidates}件（削る案 ${m.cutProposals}・確認だけ ${m.reviewOnly}）`);
    console.log(`  削る案のうち、あなたも削った割合（適合率）: ${pct(m.precision)}（削る案 ${m.cutSeconds.toFixed(1)}秒）`);
    console.log(`  あなたが削った時間のうち、削る案で拾えた割合（再現率）: ${pct(m.recall)}／確認だけも含めると ${pct(m.recallWithReview)}`);
    console.log(`  時間の一致率（削る・残すが同じだった割合）: ${pct(m.timeAgreement)}`);
    console.log(`  削る案をすべて採用した長さ: ${m.predictedSeconds.toFixed(1)}秒（あなたの完成 ${v.finalSeconds.toFixed(1)}秒）`);
    const s = m.speechRemovals;
    console.log(`  声を含む削除 ${s.count}区間 ${s.seconds.toFixed(1)}秒: 削る案で ${s.foundByCut}・確認だけも含めて ${s.foundWithReview} 区間を発見（時間で ${pct(ratio(s.coveredSecondsByCut, s.seconds))}）`);
    console.log(`  間だけの削除 ${m.pauseRemovals.count}区間 ${m.pauseRemovals.seconds.toFixed(1)}秒: 削る案で時間の ${pct(ratio(m.pauseRemovals.coveredSecondsByCut, m.pauseRemovals.seconds))}`);
  }
  console.log("\n種類ごと（＋追加候補）: 件数・秒・あなたも削った割合");
  for (const k of t.withRound2.byKind) console.log(`  ${CUT_KIND_LABELS[k.kind]}（${k.suggestion === "cut" ? "削る案" : "確認だけ"}）: ${k.count}件 ${k.seconds.toFixed(1)}秒 ${pct(k.userAlsoRemoved)}`);
  if (t.openingRetakes.length) console.log(`冒頭の撮り直し: ${t.openingRetakes.map((o) => `${fmtTime(o.start)}–${fmtTime(o.end)}（${o.suggestion === "cut" ? "削る案" : "確認"}、一致 ${pct(o.userAlsoRemoved)}）`).join("・")}`);
  else console.log("冒頭の撮り直し: 候補なし");
  console.log(`つなぎ目に残した間（完成動画の音声、中央値）: ${t.pausesAtCuts.medianSeconds ?? "-"}秒（${t.pausesAtCuts.count}か所）`);
  console.log(`\n見つからなかった声を含む削除: ${t.misses.length}区間 ${t.misses.reduce((n, m) => n + m.seconds, 0).toFixed(1)}秒／あなたが残した所への削る案: ${t.falseCuts.length}件 ${t.falseCuts.reduce((n, f) => n + f.keptSeconds, 0).toFixed(1)}秒`);
  if (!options.list) {
    console.log("（一覧は --list）");
    return;
  }
  const limit = options.limit ?? 20;
  console.log(`\n見つからなかった削除（長い順、${Math.min(limit, t.misses.length)}/${t.misses.length}）:`);
  for (const m of t.misses.slice(0, limit)) console.log(`  ${fmtTime(m.start)}–${fmtTime(m.end)} ${m.seconds.toFixed(1)}秒（候補が覆う ${pct(m.covered)}）「${m.text || "（文字なし）"}」　前:${m.before}／後:${m.after}`);
  console.log(`\n残した所への削る案（長い順、${Math.min(limit, t.falseCuts.length)}/${t.falseCuts.length}）:`);
  for (const f of t.falseCuts.slice(0, limit)) console.log(`  ${fmtTime(f.start)}–${fmtTime(f.end)} ${CUT_KIND_LABELS[f.kind]}${f.round === 2 ? "（追加）" : ""} 残した ${f.keptSeconds.toFixed(1)}秒「${f.text || "（間）"}」 ${f.reason}`);
}

export function listTrials(): Trial[] {
  if (!fs.existsSync(STYLE_TRIALS_DIR)) return [];
  return fs
    .readdirSync(STYLE_TRIALS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<Trial>(path.join(STYLE_TRIALS_DIR, f)))
    .filter((t) => t.kind === "trial")
    .sort((a, b) => Number(a.inSample) - Number(b.inSample) || a.id.localeCompare(b.id));
}

export function printTrialSummary(trials: Trial[]) {
  if (!trials.length) {
    console.log("検証の結果はまだありません（npm run evaluate -- --project=<id>）。");
    return;
  }
  console.log("案件 | 種類 | ツール | 元→完成（秒） | 削る案の長さ | 適合率 | 再現率（確認込み） | 時間の一致 | 声の削除の発見");
  const row = (t: Trial) => {
    const m = t.withRound2;
    return `${t.id} | ${t.inSample ? "学習に使用" : "新しい動画"} | ${t.tool.commit ?? "?"}${t.tool.projectSettings ? "＋案件設定" : ""} | ${t.video.sourceSeconds.toFixed(0)}→${t.video.finalSeconds.toFixed(0)} | ${m.predictedSeconds.toFixed(0)} | ${pct(m.precision)} | ${pct(m.recall)}（${pct(m.recallWithReview)}） | ${pct(m.timeAgreement)} | ${m.speechRemovals.foundWithReview}/${m.speechRemovals.count}`;
  };
  for (const t of trials) console.log(row(t));
  for (const inSample of [false, true]) {
    const g = trials.filter((t) => t.inSample === inSample);
    if (!g.length) continue;
    const mean = (f: (m: TrialMetrics) => number | null) => {
      const xs = g.map((t) => f(t.withRound2)).filter((x): x is number => x !== null);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    console.log(
      `平均（${inSample ? "学習に使った動画" : "新しい動画"} ${g.length}本）: 適合率 ${pct(mean((m) => m.precision))}・再現率 ${pct(mean((m) => m.recall))}（確認込み ${pct(mean((m) => m.recallWithReview))}）・時間の一致 ${pct(mean((m) => m.timeAgreement))}`,
    );
  }
  console.log("※ 数字は「＋追加候補」の段階。ツールが自動で出す候補だけを測っています（脱線・重なる話など、Claude が内容を見て出す提案は入りません）。");
}
