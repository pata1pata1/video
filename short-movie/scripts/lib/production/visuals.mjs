// @ts-check
// 画像・映像の安全方針（ニュースショート）。画像の中身（ピクセル）は機械では確かめられないので、
// 台本の札が使う画像をすべて <id>/input/visuals.json に「種類（category）」つきで登録し、許された種類だけを使う。
// 画像を作る・選ぶときは、この方針と制作依頼の creative.visualRules・scriptRules.safetyRules を守る（最後は目で確かめる）。

/** 事件・犯罪のニュースで使ってよい画像の種類。 */
export const SAFE_CATEGORIES = {
  "map-overview": "東京・中野区などを示す概略地図（具体的な事件現場の地点は示さない）",
  "city-street": "一般的な東京の街並み（事件現場と特定できないもの）",
  "night-city": "夜の都市のイメージ",
  "police-generic": "警察車両・警察署の一般的なイメージ（事件の現場・人物を写さない）",
  "text-card": "「逮捕」「捜査」「分かっていること」などのテキストカード",
  "date-card": "日付カード",
  "timeline-card": "時系列カード",
  "abstract-news-bg": "抽象的なニュース背景",
  "chapter-title": "章タイトル",
};

/** 使ってはいけない画像の種類（登録しても止める）。 */
export const PROHIBITED_CATEGORIES = {
  "victim-like-person": "被害者を想起させる女性の人物写真",
  "suspect-like-person": "容疑者を想起させる男性の人物写真",
  "knife-closeup": "刃物のクローズアップ",
  blood: "血",
  "stabbing-depiction": "刺傷の表現",
  body: "遺体",
  reenactment: "犯行の再現",
  "real-victim-photo": "実際の被害者の写真",
  "real-suspect-photo": "実際の容疑者の写真",
  "identifiable-scene": "特定できる事件現場の写真",
};

/**
 * 事件・犯罪の題材か（制作依頼の禁止表現・安全ルールから）。
 * content-ops はどの依頼にも基本の禁止表現（culprit-asserted・unreported-label）を付けるので、それだけでは事件と見なさない
 * （2026-11-22：歴史の題材の絵・写真が「事件のニュースで使える種類ではない」で止まっていた）。事件の依頼にだけ付く禁止表現か、容疑の安全ルールで判断する。
 * @param {any} r
 */
const CRIME_ONLY_CLAIMS = ["killing-asserted", "indicted-asserted", "guilty-asserted", "motive-asserted", "victim-workplace", "robbery-item-speculated", "location-speculated"];
export const isCrimeRequest = (r) => (r.scriptRules?.prohibitedClaims ?? []).some((/** @type {any} */ p) => CRIME_ONLY_CLAIMS.includes(p.id)) || (r.scriptRules?.safetyRules ?? []).some((/** @type {string} */ s) => s.includes("容疑"));

/** 台本の札から、安全な種類の画像の登録の雛形を作る（説明は章から）。 @param {any} script @param {any} r */
export function draftVisuals(script, r) {
  const sections = r.creative.structure.map((/** @type {any} */ s) => s.section);
  /** @type {any[]} */
  const images = [];
  let si = 0;
  for (const s of script.sentences) {
    for (const c of s.cards) {
      if (!c.image) continue;
      const category = s.kind === "hook" ? "abstract-news-bg" : s.kind === "unknown" ? "text-card" : s.kind === "closing" ? "chapter-title" : "text-card";
      // 画面の文字は短いキーワード・数字・見出しだけ（1画面1メッセージ、12字まで）。台本の文章をそのまま出さない
      images.push({ file: c.image, category, description: `${sections[Math.min(si++, sections.length - 1)] ?? ""}：${SAFE_CATEGORIES[category]}`, showsIncidentLocation: false, onScreenText: [] });
    }
  }
  return { policy: "news-crime-safe/1", images, rules: [...(r.creative.visualRules ?? [])], prohibited: Object.values(PROHIBITED_CATEGORIES) };
}

/**
 * 台本が使う画像がすべて登録され、許された種類か。地図は事件現場の地点を示さないこと。
 * @param {any} script @param {any} visuals @param {any} r
 */
export function checkVisuals(script, visuals, r) {
  /** @type {string[]} */
  const issues = [];
  const crime = isCrimeRequest(r);
  const byFile = new Map((visuals?.images ?? []).map((/** @type {any} */ v) => [v.file, v]));
  for (const s of script.sentences ?? []) {
    for (const c of s.cards ?? []) {
      if (!c.image) continue;
      const v = byFile.get(c.image);
      if (!v) {
        issues.push(`${c.image}：visuals.json に登録がない（種類が分からない画像は使わない）`);
        continue;
      }
      if (v.category in PROHIBITED_CATEGORIES) issues.push(`${c.image}：使ってはいけない種類（${PROHIBITED_CATEGORIES[/** @type {keyof typeof PROHIBITED_CATEGORIES} */ (v.category)]}）`);
      else if (crime && !(v.category in SAFE_CATEGORIES)) issues.push(`${c.image}：事件のニュースで使える種類ではない（${v.category}）`);
      if (v.category === "map-overview" && v.showsIncidentLocation !== false) issues.push(`${c.image}：地図は事件現場の地点を示さない（showsIncidentLocation: false）`);
    }
  }
  return issues;
}
