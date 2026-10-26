// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/sekisui-jimenshi.json";
import narration from "../public/audio/sekisui-jimenshi/narration.json";
import mediaSources from "../public/media/sekisui-jimenshi/sources.json";
import mediaFrames from "../public/media/sekisui-jimenshi/frames.json";

export { script, narration, mediaSources, mediaFrames };
