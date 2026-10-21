// style-data/observations/<id>.json: one video's editing decisions, recorded
// as events for the editing-style learning (docs/design.md §15).
//
// S1 only observes and records. Nothing here changes candidates, settings or
// decisions, and no rule is applied.
//
// Every event keeps three parts apart:
//   features  context as categories / numbers (no speech text; filler words
//             come from the tool's own word lists) — what later rule
//             aggregation reads
//   outcome   what the user decided / what the finished video shows
//   example   the actual words, for a person checking a proposal. Only here
//             (style-data/ is outside Git, like projects/)

export const OBSERVATION_VERSION = 1;

/** talk-subtitle learns from horizontal videos only (vertical / square videos are refused). */
export type StyleScope = "landscape";

/** Where a pause / word sits: after 。！？ / after 、 / at a whisper segment break / inside a phrase. */
export type Boundary = "sentence" | "comma" | "segment" | "none";

/** Is the outcome a free choice of the user, or mostly the tool's default? */
export type Provenance = "user-choice" | "tool-default" | "user-adjusted";

export type CutCandidateEvent = {
  type: "cut-candidate";
  id: string;
  features: {
    kind: string;
    suggestion: "cut" | "review";
    confidence: number;
    round: number;
    /** Retake / restart pattern (round 2 candidates). */
    retakePattern?: string;
    retakeKeep?: "first" | "second";
    retakeSimilarity?: number;
    duration: number;
    position: "head" | "tail" | "body";
    boundaryBefore: Boundary;
    chars: number;
  };
  outcome: {
    decision: "cut" | "keep" | "pending";
    by?: string;
    /** suggestion cut → cut: true, → keep: false. A review suggestion has no default: null. */
    agreedWithSuggestion: boolean | null;
    /** Range changed by the user (seconds; + = the cut starts later / ends later). */
    adjusted?: { startDelta: number; endDelta: number; cutSeconds: number };
    /** The user wrote a note (its text is in example.note). */
    hasNote: boolean;
  };
  evidence: { start: number; end: number };
  example?: { text: string; before: string; after: string; reason: string; first?: string; second?: string; note?: string };
};

export type PauseEvent = {
  type: "pause";
  features: {
    /** Gap in the source between two words that are both in the finished video (s). */
    srcGap: number;
    /** Seconds of the gap (and of words in it) removed by cuts. */
    removedSeconds: number;
    /** Words between the two that were cut (fillers, restarts…). */
    removedWords: number;
    boundary: Boundary;
    edge?: "head" | "tail";
  };
  outcome: {
    /** What is left in the finished video (s). */
    outGap: number;
    action: "kept" | "trimmed" | "joined";
    provenance: Provenance;
  };
  evidence: { srcStart: number; srcEnd: number; candidateIds: string[] };
  example?: { before: string; after: string };
};

export type FillerEvent = {
  type: "filler";
  features: {
    word: string;
    /** strong: always a filler. weak: also a normal word. */
    strength: "strong" | "weak";
    position: "sentence-head" | "clause-head" | "mid";
    followedByComma: boolean;
    /** A cut candidate of kind filler covers it. */
    proposed: boolean;
  };
  outcome: {
    /** Removed from the video (most of its time is inside a cut). */
    cut: boolean;
    /** Still in the audio but left out of the subtitle. */
    subtitle: "shown" | "omitted" | "cut" | "unknown";
  };
  evidence: { start: number; end: number; candidateIds: string[] };
  example?: { context: string };
};

export type CueEvent = {
  type: "cue";
  id: string;
  features: {
    chars: number;
    lines: number;
    maxLineChars: number;
    duration: number;
    charsPerSecond: number;
    /** Where the burned-in lines came from. */
    linesFrom: "layout" | "draft";
    reviewFlags: string[];
  };
  outcome: { state: "as-drafted" | "confirmed" | "edited" | "deleted" };
  example?: { text: string; heard: string };
};

export type SubtitleEditCategory =
  | "line-break"
  | "punctuation"
  | "term"
  | "quote"
  | "filler-removed"
  | "deletion"
  | "insertion"
  | "replacement";

export type SubtitleEditEvent = {
  type: "subtitle-edit";
  id: string;
  features: {
    categories: SubtitleEditCategory[];
    charsRemoved: number;
    charsAdded: number;
    origChars: number;
    newChars: number;
    origLines: number;
    newLines: number;
    reviewFlags: string[];
  };
  outcome: { action: "edited" | "deleted" | "confirmed"; by: string };
  example?: { orig: string; edited?: string; ops: { op: "=" | "-" | "+"; text: string }[] };
};

export type TermEvent = {
  type: "term";
  id: string;
  features: { candidateKind: string; entryKind: string; layer: string; defaultDecision: "accept" | "pending"; confidence: number };
  outcome: { decision: "accept" | "reject" | "default-accept" | "pending"; customSpelling: boolean; agreedWithDefault: boolean | null };
  example?: { from: string; to: string };
};

export type QuoteEvent = {
  type: "quote";
  features: { status: "same" | "use-quote" | "review"; keptRatio: number; similarity: number; covered: boolean };
  outcome: { state: "resolved" | "flagged" | "pending"; usedPost: boolean; flagged: boolean; cutPartly: boolean };
  example?: { line: string; heard: string };
};

/** One removed source range (from timemap.json, or reconstruction.json for reference projects). */
export type CutRangeEvent = {
  type: "cut-range";
  features: {
    seconds: number;
    /** Transcript words whose middle is inside the range. */
    words: number;
    chars: number;
    /** pause: no words inside (only a pause was removed). speech: words were removed. */
    content: "pause" | "speech";
    /** reference projects: seconds of speech-level audio inside the range (decides content). */
    speechSeconds?: number;
    position: "head" | "tail" | "body";
    /** Where the kept speech before the cut ends. */
    boundaryBefore: Boundary;
    /** Kept segment lengths on each side (s; null at the head / tail). */
    keptBefore: number | null;
    keptAfter: number | null;
  };
  outcome: { removed: true; candidateKinds: string[] };
  evidence: { srcStart: number; srcEnd: number; candidateIds: string[] };
  example?: { text: string; before: string; after: string };
};

export type ObservationEvent = CutCandidateEvent | CutRangeEvent | PauseEvent | FillerEvent | CueEvent | SubtitleEditEvent | TermEvent | QuoteEvent;

export type Observation = {
  version: typeof OBSERVATION_VERSION;
  kind: "talk-subtitle-style-observation";
  project: string;
  observedAt: string;
  /** talk-subtitle: decisions made in this tool. reference: rebuilt from a video edited elsewhere (reconstruction.json). */
  origin: "talk-subtitle" | "reference";
  scope: StyleScope;
  scopeReason: string;
  format: { width: number | null; height: number | null; orientation: string | null; aspect: string | null };
  /** Which files the events come from, so a stale observation can be detected. */
  inputs: {
    sourceSha256: string | null;
    candidatesFingerprint: string | null;
    timemapDecisionsFingerprint: string | null;
    subtitleDraftFingerprint: string | null;
    termCandidatesFingerprint: string | null;
    /** Tool settings in effect (pause padding etc. shape what "kept" means). */
    candidateSettings: Record<string, unknown>;
    subtitlePreset: string | null;
    /** reference projects: when reconstruction.json was made, and its match quality. */
    reconstruction?: { createdAt: string; matchedSpeechRatio: number; speed: string; speedRatio: number | null };
  };
  completeness: {
    cutDecisions: "complete" | "partial" | "stale" | "none";
    timemap: "current" | "stale" | "none";
    subtitles: "approved" | "edited" | "draft" | "stale" | "none";
    final: boolean;
  };
  summary: ObservationSummary;
  /** How the decisions were made over time (追加修正). */
  history: {
    decisionEntries: { by: string; count: number }[];
    firstAt: string | null;
    lastAt: string | null;
    rangeAdjustments: number;
    subtitleEditsBy: { by: string; count: number }[];
  };
  glossary: { entries: number; byKind: Record<string, number>; bySource: Record<string, number>; misrecognitions: number; unconfirmedReadings: number };
  events: ObservationEvent[];
  /** What could not be observed (and why), for the report. */
  gaps: string[];
};

export type ObservationSummary = {
  sourceSeconds: number | null;
  outputSeconds: number | null;
  keptRatio: number | null;
  cutsPerMinute: number | null;
  removedSecondsByKind: Record<string, number>;
  /** Removed source ranges and kept segments (both origins). */
  cuts: {
    joins: number;
    removedRanges: number;
    removedSeconds: number;
    pauseOnly: { count: number; seconds: number; median: number | null };
    speech: { count: number; seconds: number; median: number | null };
    keptSegmentMedianSeconds: number | null;
  };
  /** Spoken characters per second of the finished video (no punctuation). */
  charsPerSecond: number | null;
  candidates: { total: number; cut: number; keep: number; pending: number; agreeWithCut: number; disagreeWithCut: number; reviewResolvedCut: number; reviewResolvedKeep: number; adjusted: number };
  /** reference projects: pauses measured on the finished video's audio (reconstruction.json pauses). */
  audioPauses?: {
    count: number;
    median: number | null;
    p90: number | null;
    max: number | null;
    atLeast03: number;
    atCut: { count: number; median: number | null };
    inside: { count: number; median: number | null };
  };
  pauses: {
    count: number;
    /** Median seconds left in the video, by boundary (pauses that were long enough to matter). */
    keptMedianByBoundary: Partial<Record<Boundary, number | null>>;
    sourceMedianByBoundary: Partial<Record<Boundary, number | null>>;
  };
  fillers: { count: number; cut: number; byWord: Record<string, { seen: number; cut: number; omittedInSubtitle: number }> };
  subtitles: { cues: number; oneLine: number; twoLines: number; medianChars: number | null; maxChars: number | null; medianSeconds: number | null; medianCharsPerSecond: number | null; edited: number; deleted: number; confirmed: number };
  terms: { total: number; accepted: number; rejected: number; customSpelling: number };
  quotes: { lines: number; usedPost: number; flagged: number; notFound: number };
};
