// @ts-check
// X 動画＋ナレーション（x-clip-narration）の公開前の品質ゲート（QUALITY_GATE、clip-v1。2026-11-20）。
// news-short-top の quality-v2（画像パネル・テキストカード・画を変える間隔）とは別の基準：主役は素材の X 動画そのもの（実写）なので、
// 見るのは「素材の利用確認」「出典の表示」「冒頭のタイトル」「元の音を残しているか（ナレーションの割合）」「字幕の長さ」「尺」「音量」。
// 型は ../../templates/x-clip-narration/README.md・../../STYLE.md の「X動画＋ナレーション（@news_mt型）」。基準を下げて通さない。

export const CLIP_QUALITY_RULES = {
  version: "clip-v1",
  duration: { ideal: [15, 60], max: 90 },
  /** タイトル（style: title）の文を始める秒の上限。 */
  titleAtMax: 1.0,
  /** ナレーションが流れている時間の割合（元の音を残す）。 */
  narrationShare: { min: 0.1, max: 0.6 },
  subtitle: { maxChars: 16 },
  audio: { lufs: [-16, -12], truePeakMax: -1 },
  gate: { overall: 70, critical: 50, floor: 40 },
  maxAttempts: 3,
};
export const CLIP_QUALITY_WEIGHTS = { rights: 15, credit: 15, titleHook: 20, narrationShare: 15, subtitleReadability: 15, duration: 10, audioQuality: 10 };
/** 1つでも満点でなければ公開しない項目（素材の利用確認・出典）。 */
const MUST = ["rights", "credit"];
const CRITICAL = ["titleHook", "narrationShare"];
const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(100, Math.round(n)));
const chars = (/** @type {string} */ s) => [...String(s ?? "").replace(/\s/g, "")].length;

/**
 * @param {{ script: any, timeline: any, audio: { lufs: number | null, truePeak: number | null } | null, mp4Duration: number | null, rightsConfirmed: boolean, rightsNote: string }} i
 */
export function scoreClipQuality(i) {
  const R = CLIP_QUALITY_RULES;
  /** @type {Record<string, { score: number, findings: string[], fixes: string[] }>} */
  const m = {};
  const clip = i.script.clip ?? {};
  const dur = i.mp4Duration ?? (Number(clip.end) - Number(clip.start ?? 0));
  m.rights = i.rightsConfirmed ? { score: 100, findings: [], fixes: [] } : { score: 0, findings: [`素材の利用確認がない（${i.rightsNote}）`], fixes: ["content-ops で production input --id=source-rights を記録する。確認できなければ公開しない"] };
  {
    const f = [];
    if (!String(i.script.credit ?? "").trim()) f.push("出典（credit）がない");
    if (!/^https?:\/\//.test(String(i.script.source?.url ?? ""))) f.push("素材の投稿 URL（source.url）がない");
    m.credit = { score: f.length ? 0 : 100, findings: f, fixes: f.length ? ["script の credit・source を書く"] : [] };
  }
  {
    const first = (i.script.sentences ?? [])[0];
    const f = [];
    let s = 100;
    if (!first || first.style !== "title") (s -= 60), f.push("最初の文がタイトル（style: title）ではない");
    else if (Number(first.at ?? 0) > R.titleAtMax) (s -= 40), f.push(`タイトルが ${first.at} 秒から（${R.titleAtMax} 秒以内）`);
    m.titleHook = { score: clamp(s), findings: f, fixes: f.length ? ["冒頭1秒以内にタイトルを読み上げる"] : [] };
  }
  {
    /** @type {Map<number, { start: number, end: number }>} */
    const bySentence = new Map();
    for (const c of i.timeline?.cards ?? []) {
      const b = bySentence.get(c.sentence) ?? { start: c.start, end: c.end };
      bySentence.set(c.sentence, { start: Math.min(b.start, c.start), end: Math.max(b.end, c.end) });
    }
    const talk = [...bySentence.values()].reduce((a, b) => a + Math.max(0, b.end - b.start), 0);
    const share = dur > 0 ? talk / dur : 0;
    const f = [];
    let s = 100;
    if (share > R.narrationShare.max) (s -= (share - R.narrationShare.max) * 250), f.push(`ナレーションが全体の ${Math.round(share * 100)}%（${Math.round(R.narrationShare.max * 100)}% まで。元の音を残す）`);
    if (share < R.narrationShare.min) (s -= 40), f.push(`ナレーションが全体の ${Math.round(share * 100)}%（要所の説明がない）`);
    m.narrationShare = { score: clamp(s), findings: f, fixes: f.length ? ["ナレーションは要所だけにし、映像の見どころでは元の音を聞かせる"] : [] };
  }
  {
    const f = [];
    let s = 100;
    for (const c of i.timeline?.cards ?? []) for (const line of String(c.text ?? "").split("\n")) if (chars(line) > R.subtitle.maxChars) (s -= 10), f.push(`字幕「${line.slice(0, 18)}…」が ${chars(line)} 字（${R.subtitle.maxChars} 字まで）`);
    m.subtitleReadability = { score: clamp(s), findings: f.slice(0, 10), fixes: f.length ? ["字幕は1枚1フレーズ（cards で区切る）"] : [] };
  }
  {
    const [lo, hi] = R.duration.ideal;
    const f = [];
    let s = 100;
    if (!(dur > 0)) (s = 0), f.push("尺が分からない（clip の start・end）");
    else if (dur < lo) (s -= (lo - dur) * 5), f.push(`${dur.toFixed(1)} 秒（${lo}〜${hi} 秒）`);
    else if (dur > hi) (s -= (dur - hi) * (dur > R.duration.max ? 4 : 2)), f.push(`${dur.toFixed(1)} 秒（${lo}〜${hi} 秒、${R.duration.max} 秒まで）`);
    m.duration = { score: clamp(s), findings: f, fixes: f.length ? ["clip の範囲を見どころに絞る"] : [] };
  }
  {
    const f = [];
    let s = 100;
    const a = i.audio;
    if (!a || a.lufs === null) (s = 40), f.push("完成MP4の音量を測れない");
    else {
      if (a.lufs < R.audio.lufs[0] || a.lufs > R.audio.lufs[1]) (s -= 30), f.push(`音量 ${a.lufs} LUFS（${R.audio.lufs[0]}〜${R.audio.lufs[1]}）`);
      if (a.truePeak !== null && a.truePeak > R.audio.truePeakMax) (s -= 30), f.push(`True Peak ${a.truePeak} dBTP（${R.audio.truePeakMax} 以下）`);
    }
    m.audioQuality = { score: clamp(s), findings: f, fixes: f.length ? ["encode をやり直す（template.json の音量）"] : [] };
  }
  const W = CLIP_QUALITY_WEIGHTS;
  const scores = Object.fromEntries(Object.keys(W).map((k) => [k, m[k].score]));
  const overallQuality = clamp(Object.entries(W).reduce((a, [k, w]) => a + w * scores[k], 0) / Object.values(W).reduce((a, b) => a + b, 0));
  const blocking = [];
  if (overallQuality < R.gate.overall) blocking.push(`overallQuality ${overallQuality} < ${R.gate.overall}`);
  for (const k of MUST) if (scores[k] < 100) blocking.push(`${k}：${m[k].findings.join("・")}`);
  for (const k of CRITICAL) if (scores[k] < R.gate.critical) blocking.push(`${k} ${scores[k]} < ${R.gate.critical}`);
  for (const [k, v] of Object.entries(scores)) if (v < R.gate.floor && !MUST.includes(k) && !CRITICAL.includes(k)) blocking.push(`${k} ${v} < ${R.gate.floor}`);
  return { rulesVersion: R.version, gate: blocking.length ? "fail" : "pass", overallQuality, scores, blocking, metrics: m };
}
