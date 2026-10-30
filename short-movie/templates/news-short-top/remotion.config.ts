// Remotion CLI config, read only by productions made the old way (node_modules junction to
// ../../movie-trivia/node_modules). New productions render with ../../scripts/render.mjs
// (shared remotion's Node API), which does not read this file.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
