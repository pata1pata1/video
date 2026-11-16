// ニュースショート動画（上部字幕固定型）の標準レイアウト。STYLE.md「ニュースショート動画」と同じ値。
// 画像（1080x1920）はこの枠どおりに作る。値を変えるときは STYLE.md も直す。

export const WIDTH = 1080;
export const HEIGHT = 1920;

/** 字幕専用帯。画像側はこの範囲に見出し・顔・重要情報を置かない（暗め・シンプルな背景）。 */
export const CAPTION_BAND = { top: 60, bottom: 300 };

/** 字幕の中心。全カット共通・画像ごとに変えない。 */
export const CAPTION_CENTER = { x: 540, y: 175 };
export const CAPTION_MAX_LINES = 2;
export const CAPTION_MAX_FONT = 72;
/** 1行の最大幅（縁取りの分を残す）。長い行は文字を小さくして収める。 */
export const CAPTION_MAX_WIDTH = 900;

/**
 * ズーム・パンを掛ける範囲（字幕帯より下の画像パネルの内側）。字幕帯とパネルの外枠は動かさない。
 * gmo-20261028 の画像に合わせた値。画像の枠が違えば案件の script.json の "panel" で上書きする。
 */
export const PANEL = { left: 110, top: 344, width: 860, height: 1512 };

/** ズームの上限。これ以上は画像内の文字が切れやすい。 */
export const MAX_ZOOM = 1.04;

/**
 * 映像パネル型（script.json に "clips" があるとき）：画像の代わりに素材動画を流す。
 * 完成画像の枠（字幕枠・画像パネル）をコードで描く。STYLE.md の画像枠と同じ値（ai-live-20261029）。
 */
export const VIDEO_BAND_BOX = { left: 44, top: 45, width: 992, height: 250 };
export const VIDEO_PANEL = { left: 107, top: 330, width: 866, height: 1545 };
