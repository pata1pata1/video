// Remotion from talk-subtitle: the packages (bundler, renderer, react, remotion)
// and the headless Chrome are the ones installed in ../../remotion — nothing is
// installed here. talk-subtitle's own compositions live in talk-subtitle/remotion/.
//
// The Node API is used (not the remotion CLI), so remotion.config.ts (Rspack,
// Tailwind) does not apply: the default webpack + esbuild bundler is used,
// both of which run under this PC's Smart App Control.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { TOOL_ROOT } from "./paths.ts";

export const REMOTION_ROOT = path.resolve(TOOL_ROOT, "..", "..", "remotion");
export const COMPOSITIONS_ENTRY = path.join(TOOL_ROOT, "remotion", "index.ts");

type Bundler = { bundle: (o: Record<string, unknown>) => Promise<string> };
type Renderer = {
  selectComposition: (o: Record<string, unknown>) => Promise<{ id: string; width: number; height: number }>;
  renderStill: (o: Record<string, unknown>) => Promise<unknown>;
};

function remotionRequire() {
  const pkg = path.join(REMOTION_ROOT, "package.json");
  if (!fs.existsSync(pkg)) throw new Error(`remotion が見つかりません: ${REMOTION_ROOT}`);
  return createRequire(pkg);
}

/** Headless Chrome that remotion downloaded (node_modules/.remotion), if present. */
export function browserExecutable(): string | null {
  const exe =
    process.platform === "win32"
      ? path.join(REMOTION_ROOT, "node_modules", ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe")
      : null;
  return exe && fs.existsSync(exe) ? exe : null;
}

/** Bundles talk-subtitle/remotion with `publicDir` as the public folder. Returns the serve URL (a folder). */
export async function bundleCompositions(publicDir: string, onProgress?: (p: number) => void): Promise<string> {
  const req = remotionRequire();
  const { bundle } = req("@remotion/bundler") as Bundler;
  const modules = path.join(REMOTION_ROOT, "node_modules");
  return bundle({
    entryPoint: COMPOSITIONS_ENTRY,
    publicDir,
    onProgress,
    // The entry is outside remotion/: resolve react / remotion from remotion's node_modules.
    webpackOverride: (c: { resolve?: { modules?: string[] } }) => ({
      ...c,
      resolve: { ...c.resolve, modules: [modules, ...(c.resolve?.modules ?? ["node_modules"])] },
    }),
  });
}

export async function renderStillPng(serveUrl: string, compositionId: string, inputProps: Record<string, unknown>, output: string): Promise<void> {
  const req = remotionRequire();
  const { selectComposition, renderStill } = req("@remotion/renderer") as Renderer;
  const browser = browserExecutable();
  const composition = await selectComposition({ serveUrl, id: compositionId, inputProps, ...(browser ? { browserExecutable: browser } : {}) });
  await renderStill({ serveUrl, composition, inputProps, output, imageFormat: "png", overwrite: true, ...(browser ? { browserExecutable: browser } : {}) });
}

/**
 * Widths (in em) of `texts` as the subtitle font draws them, measured by the same headless
 * Chrome that renders (canvas measureText, letter spacing included). Used to decide line breaks
 * by the real width of a line instead of a character count.
 */
export async function measureTextEm(texts: string[], font: { family: string; weight: number; letterSpacingEm: number }): Promise<number[]> {
  const browser = browserExecutable();
  if (!browser) throw new Error("headless Chrome が見つかりません（remotion の node_modules/.remotion）。");
  const { execFile } = await import("node:child_process");
  const os = await import("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "talk-subtitle-measure-"));
  try {
    const page = path.join(dir, "measure.html");
    const size = 100;
    const script = `
      const texts = ${JSON.stringify(texts)};
      const x = document.createElement("canvas").getContext("2d");
      x.font = ${JSON.stringify(`${font.weight} ${size}px "${font.family}", sans-serif`)};
      x.letterSpacing = "${font.letterSpacingEm * size}px";
      document.getElementById("out").textContent = JSON.stringify({ ok: document.fonts.check(x.font), w: texts.map((t) => x.measureText(t).width / ${size}) });`;
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><pre id="out"></pre><script>${script}</script>`);
    const dom = await new Promise<string>((resolve, reject) =>
      execFile(browser, ["--headless", "--disable-gpu", "--dump-dom", `file:///${page.replace(/\\/g, "/")}`], { maxBuffer: 64 << 20 }, (err, out) => (err ? reject(err) : resolve(out))),
    );
    const m = dom.match(/<pre id="out">([^<]*)<\/pre>/);
    if (!m) throw new Error("文字幅を測れませんでした（headless Chrome の出力が想定外）。");
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as { ok: boolean; w: number[] };
    if (!r.ok) throw new Error(`フォント ${font.family} が見つかりません。`);
    return r.w;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
