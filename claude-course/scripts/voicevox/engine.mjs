// VOICEVOX ENGINE client. Talks only to the locally running engine at a fixed
// address (no external or paid API). Adapted from remotion's (formerly
// remotion-project) generate-voicevox-narration.mjs, kept self-contained here.

import { parseWav } from "./wav.mjs";

// Fixed local endpoint. Never configurable, so these scripts can't reach
// anything but the VOICEVOX ENGINE on this PC.
export const ENGINE_URL = "http://127.0.0.1:50021";
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Production voice settings, set explicitly so every run uses the same values.
 * speedScale 1.04 was chosen by ear for 玄野武宏 (1.00 / 1.04 / 1.08 / 1.12
 * compared); the rest are engine defaults.
 */
export const VOICE_SETTINGS = Object.freeze({
  speedScale: 1.04,
  pitchScale: 0,
  intonationScale: 1.0,
  volumeScale: 1.0,
});

async function engineFetch(pathAndQuery, init = {}) {
  const url = new URL(pathAndQuery, ENGINE_URL);
  if (url.origin !== ENGINE_URL) throw new Error(`Refusing non-local URL: ${url.href}`);
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(
      `Cannot reach VOICEVOX ENGINE at ${ENGINE_URL} (${err.message}). ` +
        "Start the VOICEVOX app (or engine) and try again.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${url.pathname} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

/** Confirms the engine is up and the style ID is a talk style. */
export async function checkEngine(styleId) {
  const version = await (await engineFetch("/version")).json();
  const speakers = await (await engineFetch("/speakers")).json();
  for (const speaker of speakers) {
    const style = speaker.styles?.find((s) => s.id === styleId);
    if (style) {
      if (style.type && style.type !== "talk") {
        throw new Error(`Style ID ${styleId} (${speaker.name} ${style.name}) is not a talk style.`);
      }
      return { version, speakerName: speaker.name, styleName: style.name };
    }
  }
  throw new Error(`Style ID ${styleId} was not found in GET /speakers. Stopping.`);
}

/** POST /audio_query with our fixed settings applied. */
export async function audioQuery(reading, styleId) {
  const query = await (
    await engineFetch(`/audio_query?speaker=${styleId}&text=${encodeURIComponent(reading)}`, {
      method: "POST",
    })
  ).json();
  return Object.assign(query, VOICE_SETTINGS);
}

/** audio_query -> synthesis. Returns the raw WAV bytes and its parsed form. */
export async function synthesize(reading, styleId) {
  const query = await audioQuery(reading, styleId);
  const res = await engineFetch(`/synthesis?speaker=${styleId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, wav: parseWav(bytes), kana: query.kana };
}
