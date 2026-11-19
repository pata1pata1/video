// @ts-check
// 制作依頼から台本の下書きを作る・台本の注記を確かめる。
//
// 台本の形（short-movie の script.json を広げたもの。template の cards.mjs・Short.tsx は足した項目を読まないので、今の制作はそのまま動く）：
//   sentences[]: { cards: [{ text, image?, caption? }], kind, factIds, attribution }
//     kind        : hook / fact / unknown / transition / closing
//     factIds     : この文が基づく allowedFacts の id（kind=fact は必須）
//     attribution : この文に入れた出典の言い回し（例「捜査関係者への取材によると」）。attributionRequired の事実は必須
//
// 下書きは allowedFacts の文（statement）と creative（hook・structure）だけから機械的に作る。外部の知識・推測を足さない。
// unknownFacts は kind=unknown の文にだけ置き、事実として書かない。読みやすく直すのは人・Claude の仕事で、直した後は必ず validate を通す。

import { HandoffError } from "./contract.mjs";

/** 出典の言い回し（attribution.phrases の先頭から作る）。 @param {{ type: string, phrases: string[] }} a */
export function attributionLead(a) {
  const p = a.phrases[0];
  if (a.type === "investigator") return "捜査関係者への取材によると、";
  if (a.type === "single-source" || a.type === "inconsistent") return `${p}によると、`;
  return ""; // official-view：文の中の「〜とみて調べている」が出典の明示
}

/** 文末をニュースの読み（です・ます）にする。最初に当てはまった1つだけを変える（二重に変えない）。 @param {string} s @param {boolean} reported */
export function toNarration(s, reported) {
  let t = s.replace(/[。]$/u, "");
  const paren = t.match(/（([^）]+)）$/u);
  if (paren) t = `${t.slice(0, paren.index)}。${paren[1]}`; // 「送った（男は送検を拒否した）」→ 2文
  /** @type {[RegExp, string][]} */
  const rules = [
    [/された$/u, "されました"],
    [/している$/u, reported ? "しているということです" : "しています"],
    [/ている$/u, "ています"],
    [/った$/u, "りました"],
    [/した$/u, "しました"],
    [/(女性|男性)$/u, "$1です"],
  ];
  const fix = (/** @type {string} */ x) => {
    for (const [re, to] of rules) if (re.test(x)) return x.replace(re, to);
    return x;
  };
  return `${t.split("。").map(fix).join("。")}。`;
}

/** 分かっていないことの読み（括弧の中は読み上げない・です・ます）。 @param {string} u */
export function unknownNarration(u) {
  const t = String(u)
    .replace(/（[^）]*）/gu, "")
    .replace(/[。]$/u, "")
    .replace(/ていない$/u, "ていません")
    .replace(/にない$/u, "にありません")
    .replace(/まだ$/u, "まだです");
  return `${t}。`;
}

/** 14字を超える区切りを、真ん中に近い助詞の後ろで分ける（字幕1枚に長文を出さない）。 @param {string} p @returns {string[]} */
function splitLong(p) {
  if (p.length <= 14) return [p];
  const mid = p.length / 2;
  let best = -1;
  for (const m of p.matchAll(/(?:で|が|を|は|に|と|へ|も|なら|て|の(?![うょ]))(?=[^、。」])|(?=「)/gu)) {
    const at = (m.index ?? 0) + m[0].length;
    if (at >= 4 && p.length - at >= 4 && (best < 0 || Math.abs(at - mid) < Math.abs(best - mid))) best = at;
  }
  return best < 0 ? [p] : [...splitLong(p.slice(0, best)), ...splitLong(p.slice(best))];
}

/** 長いテロップを「、」と助詞で札に分ける（1枚は短く）。 @param {string} text */
export function splitCards(text) {
  const parts = (text.match(/[^、。]+[、。]?/gu) ?? [text]).flatMap(splitLong);
  /** @type {{ text: string }[]} */
  const cards = [];
  for (const p of parts) {
    const last = cards[cards.length - 1];
    if (last && last.text.length + p.length <= 12 && !last.text.endsWith("。")) last.text += p; // 字幕1枚は短く（長文を一度に出さない）
    else cards.push({ text: p });
  }
  return cards;
}

/** creative.structure の content に書かれた allowedFacts の id（書かれた順）。 @param {string} content @param {string[]} ids */
export function factIdsIn(content, ids) {
  return ids.filter((id) => content.includes(id)).sort((a, b) => content.indexOf(a) - content.indexOf(b));
}

/**
 * 台本の下書き（draft）。creative.structure の順に：フック → 事実（statement に出典の言い回し）→ 分かっていないこと → 締め。
 * 画像は安全な種類（visuals.mjs）の札だけを割り当てる（中身の画像は人・Claude が作る）。
 * @param {any} r 制作依頼 @param {string} projectId
 */
export function buildDraftScript(r, projectId) {
  const facts = new Map(r.scriptRules.allowedFacts.map((/** @type {any} */ f) => [f.id, f]));
  const ids = [...facts.keys()];
  /** @type {any[]} */
  const sentences = [];
  const used = new Set();
  let img = 0;
  const nextImage = () => `${String(++img).padStart(2, "0")}.png`;
  for (const sec of r.creative.structure) {
    const sectionImage = nextImage();
    let first = true;
    const imageOnce = () => (first ? ((first = false), { image: sectionImage }) : {});
    const content = `${sec.section} ${sec.content}`;
    if (/フック|hook/i.test(sec.section)) {
      const hookIds = factIdsIn(r.creative.hook, ids);
      sentences.push({ kind: "hook", factIds: hookIds, attribution: [], cards: splitCards(r.creative.hook).map((c, i) => (i === 0 ? { ...c, ...imageOnce() } : c)) });
      continue;
    }
    if (/unknownFacts|分かっていない/u.test(content)) {
      for (const u of r.scriptRules.unknownFacts) {
        const text = unknownNarration(u);
        sentences.push({ kind: "unknown", factIds: [], attribution: [], cards: splitCards(text).map((c, i) => (i === 0 ? { ...c, ...imageOnce() } : c)) });
      }
      continue;
    }
    const secIds = factIdsIn(sec.content, ids).filter((id) => !used.has(id));
    if (!secIds.length) {
      if (/締め|まとめ|closing/iu.test(sec.section)) sentences.push({ kind: "closing", factIds: [], attribution: [], cards: [{ text: "出典は概要欄にまとめています。", ...imageOnce() }] });
      continue;
    }
    for (const id of secIds) {
      used.add(id);
      const f = facts.get(id);
      const lead = f.attribution ? attributionLead(f.attribution) : "";
      const text = `${lead}${toNarration(f.statement, f.attribution?.type === "investigator")}`;
      const attribution = f.attribution ? f.attribution.phrases.filter((/** @type {string} */ p) => text.includes(p)) : [];
      sentences.push({ kind: "fact", factIds: [id], attribution, cards: splitCards(text).map((c, i) => (i === 0 ? { ...c, ...imageOnce() } : c)) });
    }
  }
  return {
    id: projectId,
    voice: { speaker: r.video.voice.speaker, name: r.video.voice.name, speedScale: r.video.voice.speedScale },
    sentenceGap: 0.4,
    captionColor: "#c8102e",
    pronunciation: {},
    sentences,
    motion: {},
    production: { draft: true, campaignId: r.campaignId, key: r.key, requestId: r.requestId, generatedFrom: "allowedFacts+creative", note: "下書き。読みやすく直したら production.mjs validate を必ず通す（fail ならナレーション・字幕・レンダリングをしない）" },
  };
}

const textOf = (/** @type {any} */ s) => (s.cards ?? []).map((/** @type {any} */ c) => `${c.text ?? ""}${c.caption ? ` ${c.caption}` : ""}`).join("");

/**
 * video 側の事前確認（content-ops の validate-script の前に、形の誤りを早く見つける）：
 *   - 文ごとに kind・factIds・attribution があるか。kind=fact は factIds 必須
 *   - attributionRequired の事実を使う文に attribution（言い回し）があり、本文にも入っているか
 *   - attribution に書いた言い回しが本文に入っているか
 *   - unknownFacts を kind=fact の文で事実として書いていないか
 * @param {any} script @param {any} r
 */
export function precheckScript(script, r) {
  if (!script || !Array.isArray(script.sentences)) throw new HandoffError("台本の形が違います（sentences がない）");
  /** @type {{ sentence: number, problem: string }[]} */
  const issues = [];
  const req = new Map(r.scriptRules.attributionRequired.map((/** @type {any} */ a) => [a.factId, a]));
  const unknownCores = r.scriptRules.unknownFacts.map((/** @type {string} */ u) => String(u).split(/[（(]|は|が/u)[0].trim()).filter((/** @type {string} */ x) => x.length >= 2);
  script.sentences.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    const text = textOf(s);
    if (!["hook", "fact", "unknown", "transition", "closing"].includes(s.kind)) issues.push({ sentence: i, problem: `kind がない・不正（${s.kind}）` });
    if (!Array.isArray(s.factIds)) issues.push({ sentence: i, problem: "factIds がない（事実を使わない文は []）" });
    if (!Array.isArray(s.attribution)) issues.push({ sentence: i, problem: "attribution がない（出典の言い回しがない文は []）" });
    if (s.kind === "fact" && !(s.factIds ?? []).length) issues.push({ sentence: i, problem: "kind=fact なのに factIds が空" });
    for (const id of s.factIds ?? []) {
      const a = req.get(id);
      if (!a) continue;
      const hit = a.phrases.filter((/** @type {string} */ p) => text.includes(p));
      if (!hit.length) issues.push({ sentence: i, problem: `${id} は出典の明示が必要（「${a.phrases.join("」か「")}」が本文にない）` });
      else if (!(s.attribution ?? []).some((/** @type {string} */ x) => a.phrases.some((/** @type {string} */ p) => x.includes(p)))) issues.push({ sentence: i, problem: `${id} の出典の言い回しを attribution に書いていない` });
    }
    for (const x of s.attribution ?? []) if (!text.includes(x)) issues.push({ sentence: i, problem: `attribution「${x}」が本文にない` });
    if (s.kind === "fact") for (const core of unknownCores) if (text.includes(core)) issues.push({ sentence: i, problem: `分かっていないこと（${core}）を事実の文に書いている` });
    for (const c of s.cards ?? []) if ((c.caption ?? c.text).replace(/[\s、。]/gu, "").length > 16) issues.push({ sentence: i, problem: `字幕が長い（「${c.caption ?? c.text}」。1枚16字まで・長文を一度に出さない）` });
  });
  return issues;
}
