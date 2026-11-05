// intermediate/transcript.json: one format for every speech-to-text backend.
//
// It is remotion's SttTranscript (schemaVersion 1, src/core/speech/stt.ts):
// remotion's Transcript whose `engine` may name either engine and carries the
// backend / run settings (backend / backendReason are absent in files written by
// remotion's video:transcribe). Later steps (glossary correction, cut candidates,
// subtitles) only read language / source / text / segments, so they never need
// to know which backend produced the file.

import type { SttBackend, SttEngine, SttTranscript, TranscriptSegment, TranscriptWord } from "./engine.ts";

export type { SttBackend, TranscriptSegment, TranscriptWord };

/** talk-subtitle's setting (input/settings.json transcribe.backend): auto = Windows → faster-whisper, Mac → whisper-cpp. */
export const STT_BACKENDS = ["auto", "whisper-cpp", "faster-whisper"] as const;
export type SttBackendSetting = (typeof STT_BACKENDS)[number];

export type TranscriptEngine = SttEngine;

export type Transcript = SttTranscript;

/** What runTranscribe writes: Transcript + talk-subtitle's provenance block. */
export type TranscriptFile = Transcript & {
  talkSubtitle?: { sourceFile: string; sourceSha256: string; prompt: string; glossaryFingerprint: string };
};
