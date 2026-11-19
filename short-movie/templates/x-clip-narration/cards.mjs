// Caption timing for x-clip-narration (an X video + narration placed at chosen times).
//
// Each sentence names "at" (seconds of the video) and is synthesized whole; the engine
// (remotion src/video-types/short-movie/cli.mjs) puts silence before it so it starts at
// "at" and reports that silence as leadSeconds. Card boundaries inside a sentence come
// from VOICEVOX mora lengths, the same rule as news-short-top.
// A sentence's last card stays HOLD seconds after the voice ends (not until the next
// sentence, which may be far away: the clip's own sound plays in between).

const HOLD = 0.6;

const readingOf = (script) => {
  const rules = Object.entries(script.pronunciation ?? {}).sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let s = text;
    for (const [from, to] of rules) s = s.split(from).join(to);
    return s.replace(/[「」『』]/g, "");
  };
};
// subtitles never show 、 or 。 (? and ! stay)
const caption = (card) => (card.caption ?? card.text).replace(/[、。]/g, "");

export function narrationPlan(script) {
  const reading = readingOf(script);
  let prev = -1;
  return script.sentences.map((sentence, si) => {
    if (typeof sentence.at !== "number" || sentence.at < prev) {
      throw new Error(`sentences[${si}].at must be a number of seconds, in order`);
    }
    prev = sentence.at;
    const texts = sentence.cards.map((c) => c.text);
    return {
      text: reading(texts.join("")),
      boundaries: texts.slice(0, -1).map((_, i) => reading(texts.slice(0, i + 1).join(""))),
      gapAfter: 0,
      at: sentence.at,
    };
  });
}

/** measured[i]: { seconds, moraStarts, rawTotal, boundaryMoras, gapSeconds, leadSeconds } */
export function cardTimeline(script, measured) {
  let clock = 0;
  const cards = [];
  const sentenceEnds = [];
  script.sentences.forEach((sentence, si) => {
    const m = measured[si];
    clock += m.leadSeconds ?? 0;
    const scale = m.seconds / m.rawTotal;
    const firstMora = [0, ...m.boundaryMoras];
    sentence.cards.forEach((c, i) => {
      const start = i === 0 ? 0 : m.moraStarts[Math.min(firstMora[i], m.moraStarts.length - 1)] * scale;
      cards.push({ sentence: si, style: sentence.style ?? "narration", text: caption(c), start: clock + start });
    });
    clock += m.seconds + (m.gapSeconds ?? 0);
    sentenceEnds[si] = clock;
  });
  cards.forEach((c, i) => {
    const next = cards[i + 1];
    if (next && next.sentence === c.sentence) c.end = next.start;
    else c.end = Math.min(sentenceEnds[c.sentence] + HOLD, next ? next.start : Infinity);
  });
  return { duration: clock, cards };
}
