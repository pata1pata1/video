// Diagrams for utsurobune-1803-20261124 only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: 国立公文書館「漂流ものがたり」（うつろ舟の女）・nippon.com（田中嘉津夫氏の取材、2020-06-17）。
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../src/diagram-kit";
import { color } from "../../src/theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={96} size={58} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 70} y={H - 60} size={32} fill={color.inkSoft} anchor="end">
    {children}
  </T>
);

// 緯度・経度 → 画面（茨城県の海岸。位置は目安）
const geo = (lon: number, lat: number) => ({ x: 300 + ((lon - 139.9) / 1.3) * 1300, y: 190 + ((36.9 - lat) / 1.25) * 560 });

// 茨城県の海岸線（おおよその点）
const COAST: [number, number][] = [
  [140.66, 36.88],
  [140.62, 36.6],
  [140.6, 36.4],
  [140.57, 36.3],
  [140.62, 36.15],
  [140.7, 35.98],
  [140.78, 35.83],
  [140.84, 35.74],
  [140.87, 35.7],
];

type Anchor = "start" | "middle" | "end";

const Pin: React.FC<{ lon: number; lat: number; label: string; sub?: string; p: number; hot?: boolean; dx?: number; dy?: number; anchor?: Anchor }> = ({
  lon,
  lat,
  label,
  sub,
  p,
  hot = false,
  dx = 0,
  dy = -64,
  anchor = "middle",
}) => {
  const { x, y } = geo(lon, lat);
  const c = hot ? color.accentOnDark : color.ink;
  return (
    <g opacity={p}>
      <circle cx={x} cy={y} r={hot ? 22 : 15} fill={hot ? color.accent : color.cool} stroke={color.ink} strokeWidth={3} />
      <T x={x + dx} y={y + dy} size={50} weight={900} fill={c} anchor={anchor}>
        {label}
      </T>
      {sub ? (
        <T x={x + dx} y={y + dy + 52} size={36} fill={color.inkSoft} anchor={anchor}>
          {sub}
        </T>
      ) : null}
    </g>
  );
};

// 流れ着いた場所。step 1：神栖市波崎の舎利浜（とされる場所）、step 2：多くの文書の「小笠原越中守の領地」は鹿島灘の周りにない、step 3：伴家文書と伊能図
const MapDiagram: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const line = COAST.map(([lon, lat]) => {
    const { x, y } = geo(lon, lat);
    return `${x},${y}`;
  }).join(" ");
  const sea = geo(141.15, 36.25);
  return (
    <Svg>
      <Heading>舟が流れ着いたとされる浜</Heading>
      <g opacity={reveal(1)}>
        <polyline points={line} fill="none" stroke={color.cool} strokeWidth={8} strokeLinejoin="round" />
        <T x={geo(140.1, 36.5).x} y={geo(140.1, 36.5).y} size={46} fill={color.inkFaint}>
          茨城県
        </T>
        <T x={sea.x} y={sea.y} size={50} weight={900} fill={color.inkFaint}>
          鹿島灘
        </T>
        <T x={sea.x} y={sea.y + 56} size={34} fill={color.inkFaint}>
          （太平洋）
        </T>
      </g>
      <Pin lon={140.47} lat={36.37} label="水戸" p={reveal(1)} dx={-30} dy={-30} anchor="end" />
      <Pin lon={140.84} lat={35.74} label="神栖市 波崎" sub="舎利浜とされる" p={reveal(1, 8)} hot dx={-44} dy={-24} anchor="end" />
      <g opacity={reveal(2)}>
        <Card x={1190} y={250} w={660} h={190} highlight={1} />
        <T x={1520} y={320} size={40} weight={900}>
          多くの文書：小笠原越中守の領地
        </T>
        <T x={1520} y={392} size={40} weight={900} fill={color.accentOnDark}>
          → 鹿島灘の周りにはない
        </T>
      </g>
      <g opacity={reveal(3)}>
        <Card x={120} y={560} w={800} h={190} highlight={1} />
        <T x={520} y={628} size={40} weight={900}>
          伴家文書：「常陸原舎り濱」
        </T>
        <T x={520} y={698} size={36} fill={color.inkSoft}>
          伊能忠敬の地図（1801年の測量）にも載る
        </T>
      </g>
      <Source>位置は目安　出典：国立公文書館・nippon.com</Source>
    </Svg>
  );
};

// 文書の年表。step 1：江戸時代の文書、step 2：1947年の「空飛ぶ円盤」
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const y = 430;
  const pts = [
    { x: 250, year: "1803年", what: "漂着の話", sub: "常陸国の浜", step: 1, hot: true },
    { x: 610, year: "1815年ごろ", what: "鶯宿雑記", sub: "", step: 1, hot: false },
    { x: 970, year: "1825年", what: "兎園小説", sub: "弘賢随筆", step: 1, hot: false },
    { x: 1330, year: "1844年", what: "梅の塵", sub: "", step: 1, hot: false },
    { x: 1690, year: "1947年", what: "空飛ぶ円盤", sub: "144年後・アメリカ", step: 2, hot: true },
  ];
  return (
    <Svg>
      <Heading>江戸の文書と「空飛ぶ円盤」</Heading>
      <line x1={120} y1={y} x2={W - 120} y2={y} stroke={color.line} strokeWidth={8} opacity={reveal(1)} />
      {pts.map((p, i) => {
        const o = reveal(p.step, i * 8);
        return (
          <g key={p.year} opacity={o}>
            <circle cx={p.x} cy={y} r={24} fill={p.hot ? color.accent : color.cool} stroke={color.ink} strokeWidth={4} />
            <T x={p.x} y={y - 80} size={48} weight={900} fill={p.hot ? color.accentOnDark : color.ink}>
              {p.year}
            </T>
            <Card x={p.x - 170} y={y + 60} w={340} h={170} highlight={p.hot ? 1 : 0} />
            <T x={p.x} y={y + 125} size={46} weight={900}>
              {p.what}
            </T>
            {p.sub ? (
              <T x={p.x} y={y + 190} size={34} fill={color.inkSoft}>
                {p.sub}
              </T>
            ) : null}
          </g>
        );
      })}
      <g opacity={reveal(1, 20)}>
        <T x={W / 2} y={y + 330} size={44} fill={color.inkSoft}>
          関連する文書は、これまでに11種類
        </T>
      </g>
      <Source>出典：nippon.com（田中嘉津夫氏への取材）</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { map: MapDiagram, timeline: Timeline };
