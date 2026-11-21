// Which part of which recording the screen shows, card by card (2026-11-22). Used by the template (src/DemoShort.tsx)
// and by the quality gate (scripts/lib/production/demo.mjs), so both see the same shots. Pure: no files, no Node.
// The same rules as remotion core/capture/resolve.mjs (a step's own time range only; a step that was not recorded
// or failed cannot be shown).

export const FPS = 30;
/** The screen panel (px of the 1080x1920 frame). */
export const PANEL = { x: 40, y: 330, w: 1000, h: 1030 };
/** Longest fast-forward; beyond it the end of the operation (its result) is shown. */
export const MAX_RATE = 8;
const PAD = 0.3;
const ZOOM_AT = 0.15;
export const ZOOM_SECONDS = 0.6;

const stepOf = (log, id) => {
  const st = (log?.steps ?? []).find((s) => s.id === id);
  if (!st) throw new Error(`録画 ${log?.captureId ?? "?"} に操作「${id}」の記録がない`);
  if (!st.ok) throw new Error(`録画 ${log.captureId} の操作「${id}」は失敗している`);
  return st;
};
const full = (log) => ({ x: 0, y: 0, w: log.video?.width ?? 1920, h: log.video?.height ?? 1080 });

/** A view of the recording around rect r, with the panel's aspect, kept inside the recording. */
export function fitView(r, f, aspect, factor = 2.2) {
  let w = Math.max(r.w * factor, r.h * factor * aspect, f.w * 0.42);
  let h = w / aspect;
  if (w > f.w) (w = f.w), (h = w / aspect);
  if (h > f.h) (h = f.h), (w = h * aspect);
  // an element wider / taller than the view: show its start (the beginning of the typed text), not its middle
  const x = Math.min(Math.max(0, r.w > w * 0.9 ? r.x - 24 : r.x + r.w / 2 - w / 2), f.w - w);
  const y = Math.min(Math.max(0, r.h > h * 0.9 ? r.y - 24 : r.y + r.h / 2 - h / 2), f.h - h);
  return { x, y, w, h };
}

const keyOf = (c) => (c.shot ? `shot:${JSON.stringify(c.shot)}` : c.textCard ? `text:${JSON.stringify(c.textCard)}` : "none");

/**
 * Segments of the timeline: consecutive cards showing the same thing. A shot segment gets the recording's
 * source range (from/to, s), the play rate, the views (full → zoom on the operated element) and the highlight.
 * @param {{ duration: number, cards: any[] }} timeline
 * @param {Record<string, any>} captures  render props "captures" ({ id: log.json })
 */
export function segmentsOf(timeline, captures) {
  const segs = [];
  for (const c of timeline.cards) {
    const last = segs[segs.length - 1];
    if (last && last.key === keyOf(c)) last.end = c.end;
    else segs.push({ key: keyOf(c), start: c.start, end: c.end, shot: c.shot ?? null, textCard: c.textCard ?? null });
  }
  if (segs.length) segs[segs.length - 1].end = timeline.duration;
  const aspect = PANEL.w / PANEL.h;
  let prev = null;
  return segs.map((s) => {
    if (!s.shot) return s;
    const log = captures?.[s.shot.capture];
    if (!log) throw new Error(`録画 ${s.shot.capture} の記録（assets/captures/${s.shot.capture}/log.json）がない`);
    const steps = s.shot.steps ?? [];
    const sts = steps.map((id) => stepOf(log, id));
    const dur = Number(log.video?.durationSec ?? 0);
    let from = Math.max(0, Math.min(...sts.map((x) => x.start)) - PAD);
    const to = Math.min(dur, Math.max(...sts.map((x) => x.end)) + PAD);
    const D = Math.max(0.1, s.end - s.start);
    let rate = 1;
    if (to - from > D) {
      rate = (to - from) / D;
      if (rate > MAX_RATE) (rate = MAX_RATE), (from = to - D * MAX_RATE);
    }
    const f = full(log);
    const target = [...sts].reverse().find((x) => x.rect)?.rect ?? null;
    const zoom = s.shot.zoom ?? "auto";
    const same = prev && prev.capture === s.shot.capture;
    // an operation without an element (pause, scroll…) keeps the view it follows; the first one shows the whole screen
    const end = zoom === "full" ? f : target ? fitView(target, f, aspect, zoom === "wide" ? 3.2 : 2.2) : same ? prev.view : f;
    const startView = same ? prev.view : f;
    const views = [{ at: s.start, view: startView }, { at: s.start + ZOOM_AT, view: end }];
    const highlight = s.shot.highlight !== false && target ? { at: s.start + ZOOM_AT + ZOOM_SECONDS, rect: { x: target.x - 10, y: target.y - 10, w: target.w + 20, h: target.h + 20 } } : null;
    prev = { capture: s.shot.capture, view: end };
    return {
      ...s,
      capture: s.shot.capture,
      steps,
      src: `captures/${s.shot.capture}/${log.video?.file ?? "video.mp4"}`,
      media: { width: f.w, height: f.h },
      from,
      to,
      rate,
      views,
      highlight,
      dummy: log.tool?.kind === "dummy",
      recordedAt: log.executedAt,
    };
  });
}
