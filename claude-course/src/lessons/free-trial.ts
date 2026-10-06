import type { Rect } from "../components/ScreenFrame";
import type { Beat, BeatMedia } from "../scenes/recording";

/**
 * Free trial video (メルマガ登録者向け): what is on screen when.
 *
 * Media are the edited copies made by scripts/free-trial/prepare-recordings.mjs
 * (public/free-trial/edit/: 30fps, cropped, user name blurred, no audio).
 * Rects are in those files' pixels. Times: `at` = line id, `offset` = seconds
 * after that line starts (no `at` = scene start); `play` = source seconds.
 */

const edit = (file: string, width: number, height: number): BeatMedia => ({ src: `free-trial/edit/${file}`, width, height });

// 01: Claude Code, the first request (2810x1500). Prompt sent at 9.4s;
// 70-108.6s (long local paths in the log) is never shown.
const REC01 = edit("ft-01.mp4", 2810, 1500);
const REQUEST01 = edit("stills/01-request.png", 2810, 1500);
// 02: first version in the browser (2680x1316): hero 0-5.5, about 7-11,
// menu 12-17, features 19-23, access 24-26s.
const REC02 = edit("ft-02.mp4", 2680, 1316);
const HERO02 = edit("stills/02-hero.png", 2680, 1316);
const ABOUT02 = edit("stills/02-about.png", 2680, 1316);
const MENU02 = edit("stills/02-menu.png", 2680, 1316);
const FEATURES02 = edit("stills/02-features.png", 2680, 1316);
const ACCESS02 = edit("stills/02-access.png", 2680, 1316);
// 03: the change request (1870x974). Sent at 3.5s; summary from 30.4s.
const REC03 = edit("ft-03.mp4", 1870, 974);
const REQUEST03 = edit("stills/03-request.png", 1870, 974);
// 04: reload at 2.1s (before -> after); header メニュー link clicked at 13.25s
// (l036 「上部のメニューを押すと」: the click falls on 「押すと」, ~1.0s into the line).
const REC04 = edit("ft-04.mp4", 1806, 850);
const BEFORE04 = edit("stills/04-before.png", 1806, 850);
const AFTER04 = edit("stills/04-after.png", 1806, 850);
// 05: window narrowed 3.75-5.25s; narrow page scrolled from 11.3s.
const REC05 = edit("ft-05.mp4", 2858, 1330);

const full = (m: BeatMedia): Rect => ({ x: 0, y: 0, w: m.width, h: m.height });

// Request block in 01: whole block, and its first part (lines 1-2 + 載せる内容).
const V01_ALL: Rect = { x: 10, y: 362, w: 2790, h: 690 };
const V01_TOP: Rect = { x: 10, y: 362, w: 1290, h: 352 };
const R01_LINE1: Rect = { x: 28, y: 358, w: 1060, h: 62 };
const R01_LINE2: Rect = { x: 28, y: 430, w: 1185, h: 62 };
const R01_LIST: Rect = { x: 28, y: 500, w: 330, h: 205 };
// 02 without the sticky header (its small first-version logo).
const V02_BODY: Rect = { x: 0, y: 120, w: 2680, h: 1196 };
const R02_BUTTON: Rect = { x: 345, y: 975, w: 440, h: 145 };
const R02_PRICES: Rect = { x: 345, y: 425, w: 2020, h: 610 };
const R02_ADDRESS: Rect = { x: 340, y: 545, w: 1000, h: 300 };
// Change request block in 03 (still at 20s).
const V03_REQUEST: Rect = { x: 10, y: 432, w: 1290, h: 146 };
const R03_LINE1: Rect = { x: 18, y: 442, w: 800, h: 38 };
const R03_LINE2: Rect = { x: 18, y: 490, w: 915, h: 38 };
const R03_LINE3: Rect = { x: 18, y: 538, w: 1250, h: 36 };
// 04: shop name, 「メニューを見る」 button, header メニュー link.
const V04_HERO: Rect = { x: 80, y: 50, w: 1560, h: 734 };
const V04_COMPARE: Rect = { x: 150, y: 30, w: 950, h: 780 };
const R04_NAME: Rect = { x: 228, y: 58, w: 212, h: 66 };
const R04_BUTTON: Rect = { x: 228, y: 650, w: 300, h: 104 };
const R04_NAV_MENU: Rect = { x: 1298, y: 68, w: 96, h: 48 };
// 05: the narrow window (left part of the frame), zoomed so text stays readable.
const V05_NARROW: Rect = { x: 0, y: 0, w: 996, h: 820 };
const NARROW_LABEL = "ブラウザの幅を変えて確認";

export const freeTrialCues: Record<string, string[]> = {
  "s13-loop": ["l037", "l037", "l037"],
  "s16-step-by-step": ["l046", "l047", "l048"],
  "s17-course": ["l049", "l050", "l050", "l051"],
};

export const freeTrialBeats: Record<string, Beat[]> = {
  // 1: the finished site first (after the change), then where the changes are.
  "s01-intro": [
    {
      media: REC04,
      play: { from: 2.3, to: 13.0 },
      views: [{ view: full(REC04) }, { at: "l004", view: V04_HERO }],
      marks: [
        { at: "l002", offset: 1.9, rect: R04_NAME, until: { at: "l003" } },
        { at: "l002", offset: 2.9, rect: R04_BUTTON, until: { at: "l003" } },
      ],
    },
  ],
  "s02-finished": [
    { media: REC05, play: { from: 0, to: 3.4 }, views: [{ view: full(REC05) }] },
    {
      kind: "grid",
      at: "l006",
      view: V02_BODY,
      items: [
        { at: "l006", offset: 0.2, media: ABOUT02, label: "お店の紹介" },
        { at: "l006", offset: 1.0, media: MENU02, label: "メニューと料金" },
        { at: "l006", offset: 1.8, media: FEATURES02, label: "サロンの特徴" },
        { at: "l006", offset: 2.5, media: ACCESS02, label: "アクセス" },
      ],
    },
    { at: "l007", media: REQUEST01, views: [{ view: V01_ALL }], label: "日本語で伝えた指示" },
  ],
  // 2: the request in 01 — paste and send, then the Japanese instruction up close.
  "s03-request-screen": [
    { media: REC01, play: { from: 3.5, to: 13.8 }, views: [{ view: full(REC01) }, { at: "l011", offset: 2.6, view: V01_ALL }] },
  ],
  "s04-request-content": [
    {
      media: REC01,
      play: { from: 13.8, to: 28.3 },
      views: [{ view: V01_TOP }],
      marks: [
        { at: "l012", rect: R01_LINE1, until: { at: "l013" } },
        { at: "l013", rect: R01_LINE2, until: { at: "l015" } },
        { at: "l015", rect: R01_LIST },
      ],
    },
  ],
  "s05-request-point": [
    {
      media: REC01,
      play: { from: 28.3, to: 41.6 },
      views: [{ view: V01_TOP }, { at: "l017", view: V01_ALL }],
      marks: [
        { at: "l016", offset: 0.9, rect: R01_LINE1, until: { at: "l017" } },
        { at: "l016", offset: 2.3, rect: R01_LINE2, until: { at: "l017" } },
        { at: "l016", offset: 3.8, rect: R01_LIST, until: { at: "l017" } },
      ],
    },
  ],
  // Waiting is fast-forwarded: building (41.6-70s at 8x), then the summary.
  "s06-request-send": [
    { media: REC01, play: { from: 41.6, to: 70, rate: 8 }, views: [{ view: full(REC01) }] },
    { offset: 3.55, media: REC01, play: { from: 108.7, to: 119, rate: 2.5 }, views: [{ view: full(REC01) }] },
  ],
  // 3: the first version: top, then the sections as the narration names them.
  "s07-first-check": [
    { media: REC02, play: { from: 0, to: 5.6 }, views: [{ view: full(REC02) }] },
    { at: "l023", media: REC02, play: { from: 6, to: 26, rate: 3.6 }, views: [{ view: full(REC02) }] },
  ],
  "s08-check-yourself": [
    { media: MENU02, views: [{ view: V02_BODY }], marks: [{ at: "l025", offset: 0.6, rect: R02_PRICES }] },
    { at: "l025", offset: 3.2, media: HERO02, views: [{ view: full(HERO02) }], marks: [{ at: "l025", offset: 3.4, rect: R02_BUTTON }] },
    { at: "l026", media: ACCESS02, views: [{ view: V02_BODY }], marks: [{ at: "l026", offset: 2.4, rect: R02_ADDRESS }] },
  ],
  // 4: what to change (first version), then the change request up close.
  "s09-fix-target": [
    {
      media: BEFORE04,
      views: [{ view: full(BEFORE04) }],
      label: "変更前",
      marks: [
        { at: "l028", offset: 0.7, rect: R04_NAME },
        { at: "l028", offset: 2.6, rect: R04_BUTTON },
      ],
    },
  ],
  "s10-fix-words": [
    { media: REC03, play: { from: 1.0, to: 4.4 }, views: [{ view: full(REC03) }] },
    {
      at: "l030",
      offset: -0.4,
      media: REQUEST03,
      views: [{ view: full(REQUEST03) }, { at: "l030", offset: -0.2, view: V03_REQUEST }],
      marks: [
        { at: "l030", offset: 1.0, rect: R03_LINE1 },
        { at: "l031", rect: R03_LINE2 },
      ],
    },
  ],
  "s11-fix-mobile": [
    { media: REQUEST03, views: [{ view: V03_REQUEST }], marks: [{ at: "l032", offset: 0.4, rect: R03_LINE3, until: { at: "l033" } }] },
    { at: "l033", media: REC03, play: { from: 4.6, to: 23, rate: 6 }, views: [{ view: full(REC03) }] },
    { at: "l033", offset: 3.1, media: REC03, play: { from: 30.4, to: 36 }, views: [{ view: full(REC03) }] },
  ],
  // 5: reload (before -> after), the two changes side by side, the link to the menu.
  "s12-fix-result": [
    { media: REC04, play: { from: 0.1, to: 2.1 }, views: [{ view: full(REC04) }], label: "変更前" },
    { offset: 2.0, media: REC04, play: { from: 2.1, to: 6.4 }, views: [{ view: full(REC04) }], label: "変更後" },
    {
      kind: "compare",
      at: "l035",
      before: BEFORE04,
      after: AFTER04,
      view: V04_COMPARE,
      marks: [
        { at: "l035", offset: 0.5, rect: R04_NAME },
        { at: "l035", offset: 1.8, rect: R04_BUTTON },
      ],
    },
    {
      at: "l036",
      media: REC04,
      play: { from: 12.25, to: 17 },
      views: [{ view: full(REC04) }],
      marks: [{ at: "l036", offset: 0.45, rect: R04_NAV_MENU, until: { at: "l036", offset: 1.1 } }],
    },
  ],
  // 6: narrowing the window (PC browser, not a phone), then the narrow layout up close.
  "s14-narrow": [
    {
      media: REC05,
      play: { from: 1.5, to: 9.5 },
      views: [{ view: full(REC05) }, { offset: 4.2, view: V05_NARROW }],
      label: NARROW_LABEL,
    },
    { offset: 8.0, media: REC05, play: { from: 11.3, to: 19 }, views: [{ view: V05_NARROW }], label: NARROW_LABEL },
  ],
  // 7: the finished site with the points of this video.
  "s15-summary": [
    {
      media: REC04,
      play: { from: 2.3, to: 7.6 },
      views: [{ view: full(REC04) }],
      side: {
        heading: "今回体験した事",
        items: [
          { at: "l043", offset: 0.8, text: "日本語で依頼して作る" },
          { at: "l043", offset: 3.3, text: "作って　確認して　直す" },
          { at: "l045", text: "公開には内容の確認・公開設定も必要" },
        ],
      },
    },
  ],
};
