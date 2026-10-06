import type { Rect } from "../components/ScreenFrame";
import type { Beat, BeatMedia } from "../scenes/recording";

/**
 * Sales page intro video (販売ページの講座紹介): what is on screen when.
 *
 * Media: edited copies from scripts/sales-intro/prepare-recordings.mjs
 * (public/sales-intro/edit/), the free trial's edited salon footage
 * (public/free-trial/edit/) and Lesson 01's member-site screenshots — all
 * reused read-only. Rects are in each file's pixels. Times: `at` = line id,
 * `offset` = seconds after that line starts; `play` = source seconds.
 */

const media = (src: string, width: number, height: number): BeatMedia => ({ src, width, height });
const full = (m: BeatMedia): Rect => ({ x: 0, y: 0, w: m.width, h: m.height });

// X記事ツール (2080x1350): theme typed 0-6s, target 6-11, goal 12-19,
// tone 20-23, article type 24-35, final settings 36-41, generate at 42.5s,
// result shown from ~50.6s (the wait 42.8-50.6s is cut).
const X = media("sales-intro/edit/si-x.mp4", 2080, 1350);
const X_RESULT = media("sales-intro/edit/stills/x-result.png", 2080, 1350);
// Theme / target / goal filled in, style selects visible (19.3s of si-x.mp4).
const X_INPUTS = media("sales-intro/edit/stills/x-inputs.png", 2080, 1350);
// Opening-only demo page (public/sales-intro/demo/lumiere/, photo: demo/CREDITS.md).
const DEMO_HERO = media("sales-intro/demo/lumiere-hero.png", 3840, 2160);
// Sales page (2678x1330).
const PAGE = media("sales-intro/edit/si-page.mp4", 2678, 1330);
const PAGE_ZOOM = media("sales-intro/edit/stills/page-zoom.png", 2678, 1330);
// Lesson 01's Claude Code supporter demo (1448x866, 0-24s of it).
const SUPPORTER = media("sales-intro/edit/si-supporter.mp4", 1448, 866);
// Lesson 01 member-site screenshots (3840x2160).
const SHOT = (file: string) => media(`lessons/lesson-01/screens/member-site/${file}`, 3840, 2160);
const COURSES = SHOT("courses.png");
const OS_SWITCH = SHOT("os-switch.png");
const PROMPT_COPY = SHOT("prompt-copy.png");
const SUPPORTER_PAGE = SHOT("claude-supporter-page.png");
// Free trial salon footage (see src/lessons/free-trial.ts).
const SALON_TOP = media("free-trial/edit/ft-02.mp4", 2680, 1316);
const REQUEST01 = media("free-trial/edit/stills/01-request.png", 2810, 1500);
const BEFORE04 = media("free-trial/edit/stills/04-before.png", 1806, 850);
const AFTER04 = media("free-trial/edit/stills/04-after.png", 1806, 850);

const EXAMPLE = "Claude Codeを使った制作例";
const DEMO = "制作例";

// X tool: input fields (theme / target / goal) before the page scrolls, and the result text.
const VX_INPUTS: Rect = { x: 330, y: 380, w: 1430, h: 540 };
const VX_RESULT: Rect = { x: 330, y: 0, w: 1430, h: 700 };
// X tool inputs in x-inputs.png: 記事の内容 (theme / target / goal) to the style selects.
const VX_INPUT_FORM: Rect = { x: 296, y: 300, w: 1452, h: 906 };
// Sales page Zoom section: heading + 利用条件; the 1年間・50分・最大12回 boxes.
const VP_ZOOM: Rect = { x: 420, y: 460, w: 1840, h: 870 };
const RP_ZOOM_TERMS: Rect = { x: 1405, y: 1180, w: 790, h: 150 };
// Free trial request block and its lines (see free-trial.ts).
const V01_ALL: Rect = { x: 10, y: 362, w: 2790, h: 690 };
const R01_LINE2: Rect = { x: 28, y: 430, w: 1185, h: 62 };
const R01_LIST: Rect = { x: 28, y: 500, w: 330, h: 205 };
// Salon page: shop name and 「メニューを見る」 button; the hero part for comparing.
const R04_NAME: Rect = { x: 228, y: 58, w: 212, h: 66 };
const R04_BUTTON: Rect = { x: 228, y: 650, w: 300, h: 104 };
const V04_COMPARE: Rect = { x: 150, y: 30, w: 950, h: 780 };
// Lesson 01 screenshots: the same zoom targets as the Lesson 01 video.
const F_COURSES: Rect = { x: 540, y: 180, w: 2560, h: 1440 };
const F_OS: Rect = { x: 1100, y: 0, w: 2200, h: 1238 };
const F_PROMPT: Rect = { x: 1060, y: 549, w: 2200, h: 1238 };
const F_SUPPORTER_PAGE: Rect = { x: 1060, y: 0, w: 2200, h: 1238 };
// Supporter demo: the chat window, and the start of the answer only (the
// 修正→commit→push lines below it stay out, as in Lesson 01).
const VS_CHAT: Rect = { x: 274, y: 110, w: 900, h: 538 };
const VS_ANSWER: Rect = { x: 330, y: 70, w: 670, h: 175 };

export const salesIntroCues: Record<string, string[]> = {
  "s07-loop": ["l014", "l014", "l014"],
  "s16-start-small": ["l029", "l030", "l031"],
};

export const salesIntroBeats: Record<string, Beat[]> = {
  // 1: a site (opening-only demo page) and, on 「自分の仕事に合わせたツール」
  // (+1.58s into l001), the X article tool's input form; then the catch copy.
  "s01-hook": [
    { media: DEMO_HERO, views: [{ view: full(DEMO_HERO) }], label: DEMO },
    {
      at: "l001",
      offset: 1.45,
      media: X_INPUTS,
      views: [{ view: VX_INPUT_FORM }],
      label: EXAMPLE,
      side: {
        width: 420,
        heading: "X記事作成ツール",
        items: [
          { at: "l001", offset: 1.9, text: "テーマ" },
          { at: "l001", offset: 2.3, text: "ターゲット・目的" },
          { at: "l001", offset: 2.7, text: "文章のスタイル" },
        ],
      },
    },
  ],
  "s02-catch": [
    {
      kind: "text",
      rows: [
        { at: "l003", text: "つくる　効率化する　自動化する" },
        { at: "l004", text: "Claude Codeを|あなたの道具に", accent: true },
      ],
    },
  ],
  "s03-course": [{ media: PAGE, play: { from: 24, to: 30 }, views: [{ view: full(PAGE) }] }],
  // 2: the salon site — request, result, and the two changes.
  "s04-salon": [{ media: SALON_TOP, play: { from: 0, to: 5.6 }, views: [{ view: full(SALON_TOP) }] }],
  "s05-request": [
    {
      media: REQUEST01,
      views: [{ view: V01_ALL }],
      label: "日本語で伝えた指示",
      marks: [
        { at: "l009", offset: 1.4, rect: R01_LIST, until: { at: "l009", offset: 3.0 } },
        { at: "l009", offset: 3.0, rect: R01_LINE2 },
      ],
    },
  ],
  "s06-fix": [
    {
      media: BEFORE04,
      views: [{ view: full(BEFORE04) }],
      label: "変更前",
      marks: [
        { at: "l011", rect: R04_NAME },
        { at: "l012", rect: R04_BUTTON },
      ],
    },
    {
      kind: "compare",
      at: "l013",
      before: BEFORE04,
      after: AFTER04,
      view: V04_COMPARE,
      marks: [
        { at: "l013", offset: 0.3, rect: R04_NAME },
        { at: "l013", offset: 0.3, rect: R04_BUTTON },
      ],
    },
  ],
  // 3: the X article tool — a production example, inputs, the generated draft.
  "s08-not-only": [{ media: X, play: { from: 0, to: 0.1 }, views: [{ view: full(X) }], label: EXAMPLE }],
  "s09-tool": [
    { media: X, play: { from: 0, to: 6.2 }, views: [{ view: full(X) }, { at: "l017", offset: 1.5, view: VX_INPUTS }], label: EXAMPLE },
  ],
  "s10-tool-input": [
    {
      media: X,
      play: { from: 6.2, to: 41, rate: 7 },
      views: [{ view: full(X) }],
      label: EXAMPLE,
      side: {
        heading: "選ぶ・入力する",
        items: [
          { at: "l018", offset: 0.2, text: "テーマ" },
          { at: "l018", offset: 1.0, text: "届けたい相手" },
          { at: "l018", offset: 2.4, text: "文章のスタイル" },
        ],
      },
    },
    { at: "l018", offset: 4.6, media: X, play: { from: 41, to: 42.8 }, views: [{ view: full(X) }], label: EXAMPLE },
  ],
  "s11-tool-check": [
    { media: X, play: { from: 50.6, to: 54 }, views: [{ view: full(X) }], label: EXAMPLE, badge: "待ち時間を省略" },
    { at: "l019", offset: 2.2, media: X_RESULT, views: [{ view: VX_RESULT }], label: EXAMPLE },
  ],
  // 4: how the course is learned — member site as the learning environment.
  "s14-steps": [
    {
      media: COURSES,
      views: [{ view: full(COURSES) }, { at: "l025", offset: 1.0, view: F_COURSES }],
      label: "会員サイト（受講環境）",
      side: {
        heading: "順番に進められる",
        items: [
          { at: "l025", offset: 1.3, text: "環境の準備" },
          { at: "l025", offset: 2.6, text: "基本操作" },
          { at: "l026", text: "指示の出し方" },
          { at: "l026", offset: 1.4, text: "制作と修正" },
        ],
      },
    },
  ],
  "s15-platform": [
    { media: OS_SWITCH, views: [{ view: full(OS_SWITCH) }, { offset: 1.2, view: F_OS }], label: "Mac／Windows対応" },
    { at: "l028", media: PROMPT_COPY, views: [{ view: full(PROMPT_COPY) }, { at: "l028", offset: 0.6, view: F_PROMPT }], label: "教材の説明と指示文" },
  ],
  // 5: support — the AI supporter (both plans), Zoom (Premium only).
  "s17-supporter": [
    {
      media: SUPPORTER_PAGE,
      views: [{ view: full(SUPPORTER_PAGE) }, { offset: 1.5, view: F_SUPPORTER_PAGE }],
      label: "Standard・Premium共通：AIサポーター",
    },
    { at: "l033", media: SUPPORTER, play: { from: 8.8, to: 12.4 }, views: [{ view: VS_CHAT }], label: "Standard・Premium共通：AIサポーター" },
    { at: "l033", offset: 3.8, media: SUPPORTER, play: { from: 18.8, to: 23.6 }, views: [{ view: VS_ANSWER }], label: "Standard・Premium共通：AIサポーター" },
    {
      at: "l034",
      media: SUPPORTER_PAGE,
      views: [{ view: F_SUPPORTER_PAGE }],
      label: "Standard・Premium共通：AIサポーター",
      side: {
        heading: "AIサポーター",
        items: [
          { at: "l034", offset: 0.2, text: "Standardプラン" },
          { at: "l034", offset: 0.9, text: "Premiumプラン" },
        ],
      },
    },
  ],
  "s18-zoom": [
    {
      media: PAGE_ZOOM,
      views: [{ view: VP_ZOOM }],
      label: "販売ページより",
      marks: [{ at: "l036", offset: 1.2, rect: RP_ZOOM_TERMS }],
      side: {
        heading: "Zoom個別サポート",
        items: [
          { at: "l036", text: "Premium限定" },
          { at: "l036", offset: 1.2, text: "１年間・最大12回" },
        ],
      },
    },
  ],
  // 6: what you can make — the site and the tool, then the closing cards.
  "s20-list": [
    {
      media: AFTER04,
      views: [{ view: full(AFTER04) }],
      side: {
        heading: "できる事が増える",
        items: [
          { at: "l038", text: "ホームページを作る" },
          { at: "l039", text: "仕事の手間を減らす" },
          { at: "l040", text: "自分に必要なツールを作る" },
        ],
      },
    },
    {
      at: "l039",
      media: X_RESULT,
      views: [{ view: VX_RESULT }],
      label: EXAMPLE,
      side: {
        heading: "できる事が増える",
        items: [
          { at: "l038", text: "ホームページを作る" },
          { at: "l039", text: "仕事の手間を減らす" },
          { at: "l040", text: "自分に必要なツールを作る" },
        ],
      },
    },
  ],
};
