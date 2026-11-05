// Analysis / candidate settings: defaults here, overridable per project in
// input/settings.json (only the keys given there are replaced). These are
// starting values to be tuned on real footage, not final rules.

import os from "node:os";
import { readJsonIfExists } from "./project.ts";
import type { SttBackendSetting } from "./transcript.ts";
import type { ProjectPaths } from "./paths.ts";

export const DEFAULT_SETTINGS = {
  silence: {
    /** null = derive from the measured mean volume (meanVolume - offset, clamped). */
    noiseDb: null as number | null,
    noiseOffsetDb: 14,
    noiseMinDb: -50,
    noiseMaxDb: -30,
    /** Shortest silence recorded in silences.json. */
    minDetectSeconds: 0.3,
  },
  candidates: {
    /**
     * Pause rules learned from the user's own landscape talk edits (ref-landscape-001〜004,
     * docs/landscape-edit-pattern.md; adopted as defaults 2026-11-04). Landscape talk videos only.
     *   sentence boundary (end of a whisper segment / 。！？): pauses under minGapSeconds stay as they are,
     *     longer ones are shortened to sentencePauseSeconds
     *   mid-phrase (inside a segment, including after 、): pauses of phraseMinGapSeconds or more are
     *     shortened to phrasePauseSeconds
     */
    /** A sentence-boundary gap at least this long becomes a pause candidate. */
    minGapSeconds: 0.7,
    /** Pause left at a sentence boundary after the cut (half on each side). */
    sentencePauseSeconds: 0.5,
    /** A mid-phrase gap at least this long becomes a pause candidate. */
    phraseMinGapSeconds: 0.5,
    /** Pause left inside a sentence after the cut (half on each side). */
    phrasePauseSeconds: 0.3,
    /** A pause counts as quiet (cut proposed) when its RMS is this far below the speaker's level. */
    quietMarginDb: 15,
    /**
     * Old rule (before 2026-11-04): the same room on each side of every pause, whatever the boundary.
     * null = use the sentence / phrase rules above. A number (e.g. 0.2 in a project's settings.json)
     * brings the old behaviour back for that project.
     */
    keepPaddingSeconds: null as number | null,
    /** Head/tail: keep this much before the first / after the last word. */
    edgePaddingSeconds: 0.3,
    /** Consecutive sentences at least this similar are a retake. */
    retakeSimilarity: 0.6,
    retakeMinChars: 6,
    /** Mean word probability below this marks a sentence "unclear". */
    unclearProbability: 0.45,
    /** Removal proposed (the user cut 14 of 16 in the reference edits). */
    strongFillers: ["えー", "えーと", "えーっと", "えっと", "えと", "あのー", "うーん", "んー", "うー", "あー", "えーっ"],
    /** Review only: also ordinary words. Kept in this list for the style observer and subtitles. */
    weakFillers: ["あの", "その", "まあ", "なんか", "ま"],
    /** Part of how the speaker talks: no filler candidate at all (the user kept 7 in 10 「なんか」). */
    speechStyleWords: ["なんか"],
    /** Opening retakes: look for restarted openings within this many seconds from the first word. */
    openingWindowSeconds: 120,
    /** Repeated connectives at a phrase head (「でで」「だからだから」): the earlier ones are proposed for removal. */
    // (not まあ/これ/それ: 「まあまあ」「これこれ」「それそれ」 are ordinary speech)
    repeatedConnectives: ["で", "だから", "それで", "あと", "この", "その", "あの"],
    correctionMarkers: ["じゃなくて", "じゃなく", "言い直", "いいなお", "もう一回", "もう一度", "間違えた", "間違え", "失礼しました", "すみません", "ごめんなさい", "撮り直"],
  },
  transcribe: {
    /** auto: Windows → faster-whisper, Mac and others → whisper-cpp. */
    backend: "auto" as SttBackendSetting,
    language: "ja",
    /** Same name for both backends. */
    model: "large-v3-turbo",
    promptMaxChars: 200,
    fasterWhisper: {
      computeType: "int8",
      /** Physical cores of the Windows PC (i5-9400). */
      threads: Math.min(6, os.availableParallelism?.() ?? os.cpus().length),
      beamSize: 5,
      /**
       * faster-whisper's condition_on_previous_text. true (default, unchanged) feeds the previous text
       * back as context. false stops a hallucination (one phrase repeated to the end) from carrying on;
       * set it per project in input/settings.json when a transcript loops.
       */
      conditionOnPreviousText: true,
    },
    whisperCpp: {
      /** undefined = remotion defaults (all cores up to 8, greedy). */
      threads: undefined as number | undefined,
      beamSize: undefined as number | undefined,
    },
  },
  render: {
    /**
     * Picture brightness for the burn-in / final render (1 = unchanged, 1.2 = 20% brighter).
     * Luma is scaled up from black (black stays black, the brightest parts may clip); subtitles are not affected.
     */
    brightness: 1,
    /**
     * BGM (one audio file in input/bgm/, optional): mixed under the voice by the shared engine
     * (core mixVoiceWithBgm: looped with crossfades, faded in/out, ducked while the voice speaks).
     * The BGM sits this many LU under the voice.
     */
    bgmBelowVoiceDb: 20,
    /** Every subtitle is shown this many seconds later (start and end alike; negative = earlier). */
    subtitleDelaySeconds: 0,
  },
};

export type Settings = typeof DEFAULT_SETTINGS;

export function loadSettings(paths: ProjectPaths): Settings {
  const override = readJsonIfExists<Partial<{ [K in keyof Settings]: Partial<Settings[K]> }>>(paths.settings) ?? {};
  return {
    silence: { ...DEFAULT_SETTINGS.silence, ...override.silence },
    candidates: { ...DEFAULT_SETTINGS.candidates, ...override.candidates },
    render: { ...DEFAULT_SETTINGS.render, ...override.render },
    transcribe: {
      ...DEFAULT_SETTINGS.transcribe,
      ...override.transcribe,
      fasterWhisper: { ...DEFAULT_SETTINGS.transcribe.fasterWhisper, ...override.transcribe?.fasterWhisper },
      whisperCpp: { ...DEFAULT_SETTINGS.transcribe.whisperCpp, ...override.transcribe?.whisperCpp },
    },
  };
}
