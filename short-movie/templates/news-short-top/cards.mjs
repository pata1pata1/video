// How this template times its captions (short-movie's own rule, not the engine's).
//
// Each sentence is synthesized whole (natural intonation). Card boundaries inside a
// sentence come from VOICEVOX's own mora lengths: the mora count of the text up to the
// boundary is looked up in the whole sentence's audio_query, and the raw mora times are
// scaled to the real length of the synthesized sentence.
//
// The engine (remotion src/video-types/short-movie/cli.mjs, core/speech) synthesizes what
// narrationPlan() asks for and hands back the mora data; cardTimeline() turns it into
// audio/timeline.json ({ duration, cards }), which src/Short.tsx draws.

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

/**
 * What to synthesize: per sentence the reading of the whole sentence, the readings of the
 * text up to each card boundary (only their mora counts are used), and the silence after it.
 */
export function narrationPlan(script) {
  const reading = readingOf(script);
  const last = script.sentences.length - 1;
  return script.sentences.map((sentence, si) => {
    const texts = sentence.cards.map((c) => c.text);
    return {
      text: reading(texts.join("")),
      boundaries: texts.slice(0, -1).map((_, i) => reading(texts.slice(0, i + 1).join(""))),
      gapAfter: si < last ? script.sentenceGap : 0,
    };
  });
}

/**
 * measured[i] for sentence i: { seconds, moraStarts, rawTotal, boundaryMoras, gapSeconds }
 * (seconds = real length, moraStarts / rawTotal = unscaled audio_query times,
 * boundaryMoras = mora count of each boundary text, gapSeconds = silence actually added).
 */
export function cardTimeline(script, measured) {
  let clock = 0;
  const cards = [];
  script.sentences.forEach((sentence, si) => {
    const m = measured[si];
    const scale = m.seconds / m.rawTotal;
    const firstMora = [0, ...m.boundaryMoras];
    sentence.cards.forEach((c, i) => {
      const start = i === 0 ? 0 : m.moraStarts[Math.min(firstMora[i], m.moraStarts.length - 1)] * scale;
      cards.push({ sentence: si, text: caption(c), image: c.image, start: clock + start });
    });
    clock += m.seconds;
    if (m.gapSeconds > 0) clock += m.gapSeconds;
  });
  // a card lasts until the next one starts; the last one until the end of the audio
  cards.forEach((c, i) => (c.end = i + 1 < cards.length ? cards[i + 1].start : clock));
  // carry the current image forward
  let img;
  for (const c of cards) c.image = img = c.image ?? img;
  return { duration: clock, cards };
}
