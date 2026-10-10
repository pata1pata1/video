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
    /** A gap between words at least this long becomes a pause candidate. */
    minGapSeconds: 0.7,
    /** A pause counts as quiet (cut proposed) when its RMS is this far below the speaker's level. */
    quietMarginDb: 15,
    /** Natural breathing room kept on each side of a cut pause. */
    keepPaddingSeconds: 0.2,
    /** Head/tail: keep this much before the first / after the last word. */
    edgePaddingSeconds: 0.3,
    /** Consecutive sentences at least this similar are a retake. */
    retakeSimilarity: 0.6,
    retakeMinChars: 6,
    /** Mean word probability below this marks a sentence "unclear". */
    unclearProbability: 0.45,
    strongFillers: ["えー", "えーと", "えーっと", "えっと", "えと", "あのー", "うーん", "んー", "うー", "あー", "えーっ"],
    weakFillers: ["あの", "その", "まあ", "なんか", "ま"],
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
    },
    whisperCpp: {
      /** undefined = remotion defaults (all cores up to 8, greedy). */
      threads: undefined as number | undefined,
      beamSize: undefined as number | undefined,
    },
  },
};

export type Settings = typeof DEFAULT_SETTINGS;

export function loadSettings(paths: ProjectPaths): Settings {
  const override = readJsonIfExists<Partial<{ [K in keyof Settings]: Partial<Settings[K]> }>>(paths.settings) ?? {};
  return {
    silence: { ...DEFAULT_SETTINGS.silence, ...override.silence },
    candidates: { ...DEFAULT_SETTINGS.candidates, ...override.candidates },
    transcribe: {
      ...DEFAULT_SETTINGS.transcribe,
      ...override.transcribe,
      fasterWhisper: { ...DEFAULT_SETTINGS.transcribe.fasterWhisper, ...override.transcribe?.fasterWhisper },
      whisperCpp: { ...DEFAULT_SETTINGS.transcribe.whisperCpp, ...override.transcribe?.whisperCpp },
    },
  };
}
