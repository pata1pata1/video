// The video being made (data only). `node scripts/new-video.mjs` rewrites this
// file and current-diagrams.ts; everything else in src/ is shared by all videos.
import script from "../script/gyudon-price.json";
import narration from "../public/audio/gyudon-price/narration.json";
import mediaSources from "../public/media/gyudon-price/sources.json";
import mediaFrames from "../public/media/gyudon-price/frames.json";

export { script, narration, mediaSources, mediaFrames };
