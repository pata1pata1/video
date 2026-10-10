// The only place talk-subtitle reaches into the remotion project's shared
// foundation (ffmpeg / ffprobe / whisper.cpp). Everything else imports from
// here, so if remotion moves, only these paths change.
//
// Layout assumed (Windows and Mac alike):
//   Projects/remotion/                 shared engine
//   Projects/video/talk-subtitle/      this tool

export {
  detectSilence,
  extractAudio,
  measureLoudness,
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
  transcribeFile,
  type Transcript as WhisperCppTranscript,
  type TranscriptSegment,
  type TranscriptWord,
} from "../../../remotion/src/core/speech/index.ts";
