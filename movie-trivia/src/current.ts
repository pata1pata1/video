// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/cat-abuse-law.json";
import narration from "../public/audio/cat-abuse-law/narration.json";
import mediaSources from "../public/media/cat-abuse-law/sources.json";
import mediaFrames from "../public/media/cat-abuse-law/frames.json";

export { script, narration, mediaSources, mediaFrames };
