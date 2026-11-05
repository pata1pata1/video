// The only place talk-subtitle reaches into the remotion project's shared
// foundation (ffmpeg / ffprobe / loudness / BGM, speech-to-text, Remotion
// rendering). Everything else imports from here, so if remotion moves, only
// these paths change. What the video looks like and every editing decision
// (cuts, subtitles, fades, brightness, the faster-whisper venv and script)
// stays in talk-subtitle; core only runs the low-level steps.
//
// Layout assumed (Windows and Mac alike):
//   Projects/remotion/                 shared engine
//   Projects/video/talk-subtitle/      this tool

export {
  burnOverlayGraph,
  detectSilence,
  extractAudio,
  loudnormApplyFilter,
  measureLoudness,
  mixVoiceWithBgm,
  probeMedia,
  resolveBinary,
  runTool,
  toolVersion,
  PROJECT_ROOT as REMOTION_ROOT,
  type Loudness,
  type MediaInfo,
  type Silence,
} from "../../../remotion/src/core/media/index.ts";

export {
  getWhisperStatus,
  resolveSttBackend,
  runFasterWhisperScript,
  SttRunError,
  transcribeWithBackend,
  transcribeWithFasterWhisper,
  type FasterWhisperRuntime,
  type SttBackend,
  type SttEngine,
  type SttTranscript,
  type TranscriptSegment,
  type TranscriptWord,
} from "../../../remotion/src/core/speech/index.ts";

export {
  bundleApp,
  headlessBrowserExecutable,
  measureTextWidthsEm,
  renderStillImage,
} from "../../../remotion/src/core/render/nodeApi.mts";
