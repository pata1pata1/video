// intermediate/transcript.json: one format for every speech-to-text backend.
//
// It is remotion's Transcript (schemaVersion 1, src/core/speech/types.ts)
// unchanged, except that `engine` may name either engine and carries the
// backend / run settings. Later steps (glossary correction, cut candidates,
// subtitles) only read language / source / text / segments, so they never
// need to know which backend produced the file.

import type { TranscriptSegment, TranscriptWord, WhisperCppTranscript } from "./engine.ts";

export type { TranscriptSegment, TranscriptWord };

export const STT_BACKENDS = ["auto", "whisper-cpp", "faster-whisper"] as const;
export type SttBackendSetting = (typeof STT_BACKENDS)[number];
export type SttBackend = Exclude<SttBackendSetting, "auto">;

export type TranscriptEngine = {
  name: "whisper.cpp" | "faster-whisper";
  version: string;
  model: string;
  /** whisper.cpp: token timestamps. faster-whisper: word timestamps (cross-attention alignment). Both approximate. */
  wordTimestamps: "token" | "word";
  /** Added by talk-subtitle (absent in files written by remotion's video:transcribe). */
  backend?: SttBackend;
  /** How "auto" was resolved, e.g. "auto (win32 → faster-whisper)". */
  backendReason?: string;
  device?: string;
  computeType?: string;
  threads?: number;
  beamSize?: number | null;
  runtime?: Record<string, string>;
};

export type Transcript = Omit<WhisperCppTranscript, "engine"> & { engine: TranscriptEngine };

/** What runTranscribe writes: Transcript + talk-subtitle's provenance block. */
export type TranscriptFile = Transcript & {
  talkSubtitle?: { sourceFile: string; sourceSha256: string; prompt: string; glossaryFingerprint: string };
};
