// Diagrams for gmo-desktop-cloud only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: GMOインターネットグループの発表（第1報〜第12報、2026年10月21〜27日）。金融庁の要請は日本経済新聞（10月23日）。
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../diagram-kit";
import { color } from "../../theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={100} size={54} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 70} y={H - 36} size={24} fill={color.inkFaint} anchor="end">
    {children}
  </T>
);

const Arrow: React.FC<{ x1: number; x2: number; y: number; c: string; dash?: boolean; opacity?: number }> = ({ x1, x2, y, c, dash, opacity = 1 }) => (
  <g opacity={opacity}>
    <line x1={x1} x2={x2 - 24} y1={y} y2={y} stroke={c} strokeWidth={8} strokeDasharray={dash ? "18 14" : undefined} />
    <polygon points={`${x2},${y} ${x2 - 30},${y - 18} ${x2 - 30},${y + 18}`} fill={c} />
  </g>
);

// 利用者のPC → クラウド上のWindows（取引ツール）→ 証券会社・FX会社。step 4 で犯人が割り込む
const Service: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const tool = reveal(2);
  const fx = reveal(3);
  const attack = reveal(4);
  const y = 520;
  return (
    <Svg>
      <Heading>お名前.com デスクトップクラウドの仕組み</Heading>
      <g opacity={reveal(1)}>
        <Card x={90} y={y - 110} w={380} h={220} />
        <T x={280} y={y - 30} size={46} weight={900}>
          利用者のPC
        </T>
        <T x={280} y={y + 40} size={30} fill={color.inkSoft}>
          ネット経由で操作
        </T>
        <Arrow x1={480} x2={680} y={y} c={color.inkSoft} />
        <Card x={690} y={y - 170} w={540} h={340} highlight={attack} />
        <T x={960} y={y - 105} size={42} weight={900}>
          クラウド上のWindows
        </T>
        <T x={960} y={y - 50} size={28} fill={color.inkSoft}>
          （GMOのサーバー）
        </T>
      </g>
      <g opacity={tool}>
        <rect x={740} y={y - 10} width={440} height={140} rx={18} fill={color.coolSoft} />
        <T x={960} y={y + 30} size={36} weight={900} fill={color.cool}>
          取引ツール（MT4/MT5）
        </T>
        <T x={960} y={y + 85} size={30} fill={color.cool}>
          24時間 FXを自動売買
        </T>
      </g>
      <g opacity={fx}>
        <Arrow x1={1240} x2={1440} y={y} c={color.cool} />
        <Card x={1450} y={y - 110} w={380} h={220} />
        <T x={1640} y={y - 30} size={40} weight={900}>
          証券会社・FX会社
        </T>
        <T x={1640} y={y + 40} size={30} fill={color.inkSoft}>
          国内外の70社超
        </T>
        <T x={1340} y={y - 50} size={26} fill={color.cool}>
          ログイン情報
        </T>
      </g>
      <g opacity={attack}>
        <rect x={760} y={120 + 30} width={400} height={86} rx={43} fill={color.accent} />
        <T x={960} y={193} size={36} weight={900} fill="#FFFFFF">
          犯人：不正なプログラム
        </T>
        <line x1={960} x2={960} y1={236} y2={y - 175} stroke={color.accent} strokeWidth={8} />
        <polygon points={`960,${y - 172} 942,${y - 202} 978,${y - 202}`} fill={color.accent} />
        <T x={1640} y={y + 175} size={40} weight={900} fill={color.accent}>
          ログイン情報を盗み
        </T>
        <T x={1640} y={y + 230} size={40} weight={900} fill={color.accent}>
          不正な取引
        </T>
      </g>
      <Source>出典：GMOインターネットグループの発表（第2報〜第4報）</Source>
    </Svg>
  );
};

// 10月19日〜27日の経緯。step ごとに行が増え、今の行を強調
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, current } = useSteps(steps);
  const rows: { step: number; date: string; text: string; hot?: boolean }[] = [
    { step: 1, date: "10月19日", text: "利用者の問い合わせで調査を開始" },
    { step: 2, date: "10月20日", text: "不正なプログラムを確認" },
    { step: 2, date: "10月21日", text: "全サーバーを停止／脅迫メール（約80億円の要求）", hot: true },
    { step: 3, date: "10月22日", text: "警察に相談／金融庁がFX各社に監視強化を要請" },
    { step: 4, date: "10月24日", text: "情報の持ち出しを認め、補償を発表" },
    { step: 5, date: "10月27日", text: "犯人とみられる者が情報を公開（12:30に確認）", hot: true },
  ];
  const top = 190;
  const gap = 108;
  return (
    <Svg>
      <Heading>発覚からの9日間</Heading>
      <line x1={330} x2={330} y1={top} y2={top + gap * (rows.length - 1)} stroke={color.line} strokeWidth={6} opacity={reveal(1)} />
      {rows.map((r, i) => {
        const y = top + i * gap;
        const on = reveal(r.step, (i % 2) * 5);
        const now = current(r.step);
        const c = r.hot ? color.accent : color.cool;
        return (
          <g key={r.date} opacity={on}>
            <circle cx={330} cy={y} r={18 + 6 * now} fill={c} />
            <T x={290} y={y} size={36} weight={900} anchor="end" fill={c}>
              {r.date}
            </T>
            <rect x={380} y={y - 40} width={1360} height={80} rx={18} fill={now > 0 ? (r.hot ? color.accentSoft : color.coolSoft) : color.card} stroke={color.line} strokeWidth={2} />
            <T x={410} y={y} size={36} weight={now > 0 ? 900 : 700} anchor="start">
              {r.text}
            </T>
          </g>
        );
      })}
      <Source>出典：GMOインターネットグループの発表、日本経済新聞</Source>
    </Svg>
  );
};

// 補償の3段：全員に5,000円 → 不正取引の損失 → 情報を公開された人に上限300万円
const Money: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal, current } = useSteps(steps);
  const cards = [
    { step: 1, who: "全ての利用者", what: "お見舞金", value: "5,000円", note: "一律・被害の有無にかかわらず" },
    { step: 2, who: "不正な取引の被害者", what: "損失の補償", value: "実際の損失", note: "GMOが確認したもの" },
    { step: 3, who: "情報を公開された人", what: "特別見舞金", value: "上限300万円", note: "1回の公開につき" },
  ];
  return (
    <Svg>
      <Heading>GMOが打ち出した補償</Heading>
      {cards.map((c, i) => {
        const x = 110 + i * 580;
        const now = current(c.step);
        return (
          <g key={c.who} opacity={reveal(c.step)}>
            <Card x={x} y={200} w={540} h={520} highlight={now} />
            <T x={x + 270} y={280} size={36} weight={700} fill={color.inkSoft}>
              {c.who}
            </T>
            <T x={x + 270} y={380} size={48} weight={900}>
              {c.what}
            </T>
            <T x={x + 270} y={500} size={64} weight={900} fill={color.accent}>
              {c.value}
            </T>
            <T x={x + 270} y={630} size={28} fill={color.inkSoft}>
              {c.note}
            </T>
          </g>
        );
      })}
      <Source>出典：GMOインターネットグループの発表（第4報・第12報）</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { service: Service, timeline: Timeline, money: Money };
