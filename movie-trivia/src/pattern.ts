// The look, pacing and voice credit fixed by the script's pattern
// (patterns/<pattern>/*.json). Add an entry here when a new pattern is made.
import { script } from "./current";
import config01 from "../patterns/pattern-01/config.json";
import design01 from "../patterns/pattern-01/design.json";
import subtitle01 from "../patterns/pattern-01/subtitle.json";
import thumbnail01 from "../patterns/pattern-01/thumbnail.json";
import voice01 from "../patterns/pattern-01/voice.json";

const PATTERNS = {
  "pattern-01": { config: config01, design: design01, subtitle: subtitle01, thumbnail: thumbnail01, voice: voice01 },
};

const id = (script as { pattern?: string }).pattern;
if (!id || !(id in PATTERNS)) throw new Error(`script "${(script as { id: string }).id}": unknown pattern "${id}" (add it to src/pattern.ts)`);

export const PATTERN = PATTERNS[id as keyof typeof PATTERNS];
