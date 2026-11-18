// @ts-check
// 場所（short-movie のルートと、動画ごとのフォルダ）。テストでは SHORT_MOVIE_PROJECTS_ROOT で一時ディレクトリに向ける。
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SHORT_MOVIE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const projectsRoot = () => path.resolve(process.env.SHORT_MOVIE_PROJECTS_ROOT ?? SHORT_MOVIE_ROOT);
/** @param {string} id */
export const projectDir = (id) => path.join(projectsRoot(), id);
