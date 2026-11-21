// Caption timing for the tool demo short (2026-11-22): the same rule as news-short-top (each sentence is
// synthesized whole, card starts come from VOICEVOX mora lengths), reused as is. A card names what the
// screen shows instead of an image: "shot" (a recorded operation, see README.md) or "textCard" (big text,
// no screen). Both carry forward to the next cards until a card names another one.
import { narrationPlan, cardTimeline as baseTimeline } from "../news-short-top/cards.mjs";

export { narrationPlan };

export function cardTimeline(script, measured) {
  const t = baseTimeline(script, measured);
  const src = script.sentences.flatMap((s) => s.cards);
  let shot;
  let textCard;
  t.cards.forEach((c, i) => {
    const s = src[i];
    if (s.shot) (shot = s.shot), (textCard = undefined);
    if (s.textCard) (textCard = s.textCard), (shot = undefined);
    if (shot) c.shot = shot;
    if (textCard) c.textCard = textCard;
    if (s.badge) c.badge = s.badge;
    delete c.image;
  });
  return t;
}
