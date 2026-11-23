// Diagrams for gunma-family-1998 only, by the name used in the script (visual.diagram).
// Shared parts: src/diagram-kit.tsx (useSteps, Svg, T, Card). Colors: color.accent / color.cool.
// Facts: 警察庁 捜査特別報奨金の広告（contents117）・FNN の報道（逃走の足取り）・警察庁 犯罪被害者白書 コラム5（公訴時効の廃止）。
import React from "react";
import { Card, Diagrams, H, StepFrames, Svg, T, useSteps, W } from "../../src/diagram-kit";
import { color } from "../../src/theme";

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W / 2} y={96} size={58} weight={900}>
    {children}
  </T>
);

const Source: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <T x={W - 70} y={H - 80} size={32} fill={color.inkSoft} anchor="end">
    {children}
  </T>
);

// 緯度・経度 → 画面（位置は目安）
const geo = (lon: number, lat: number) => ({ x: 200 + ((lon - 138.8) / 1.9) * 1500, y: 170 + ((36.6 - lat) / 0.7) * 620 });

const Pin: React.FC<{ lon: number; lat: number; label: string; sub?: string; p: number; hot?: boolean; dx?: number; dy?: number }> = ({ lon, lat, label, sub, p, hot = false, dx = 0, dy = -64 }) => {
  const { x, y } = geo(lon, lat);
  const c = hot ? color.accentOnDark : color.ink;
  return (
    <g opacity={p}>
      <circle cx={x} cy={y} r={hot ? 20 : 15} fill={hot ? color.accent : color.cool} stroke={color.ink} strokeWidth={3} />
      <T x={x + dx} y={y + dy} size={50} weight={900} fill={c}>
        {label}
      </T>
      {sub ? (
        <T x={x + dx} y={y + dy + 52} size={34} fill={color.inkSoft}>
          {sub}
        </T>
      ) : null}
    </g>
  );
};

// 逃走の足取り（FNN の報道）。step 1：出発点と走った地点、step 2：最後の目撃（刀水橋）と埼玉方面
const Route: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const bridge = geo(139.35, 36.21);
  const south = { x: bridge.x - 60, y: bridge.y + 200 };
  const p2 = reveal(2);
  return (
    <Svg>
      <Heading>報道で分かっている足取り</Heading>
      <g opacity={reveal(1)}>
        <T x={geo(139.45, 36.55).x} y={geo(139.45, 36.55).y} size={40} fill={color.inkFaint}>
          群馬県
        </T>
        <T x={geo(140.2, 36.55).x} y={geo(140.2, 36.55).y} size={40} fill={color.inkFaint}>
          茨城県
        </T>
        <T x={geo(139.95, 36.02).x} y={geo(139.95, 36.02).y} size={40} fill={color.inkFaint}>
          埼玉県
        </T>
      </g>
      <Pin lon={139.02} lat={36.36} label="旧群馬町" sub="事件の現場" p={reveal(1)} dy={-100} />
      <Pin lon={140.47} lat={36.37} label="水戸市" p={reveal(1, 8)} />
      <Pin lon={139.5} lat={36.08} label="熊谷市" p={reveal(1, 14)} dx={150} dy={10} />
      <g opacity={p2}>
        <circle cx={bridge.x} cy={bridge.y} r={46} fill="none" stroke={color.accent} strokeWidth={6} />
        <line x1={bridge.x} y1={bridge.y + 46} x2={south.x} y2={south.y} stroke={color.accent} strokeWidth={7} strokeDasharray="18 12" />
        <polygon points={`${south.x},${south.y + 30} ${south.x - 22},${south.y - 6} ${south.x + 22},${south.y - 6}`} fill={color.accent} />
      </g>
      <Pin lon={139.35} lat={36.21} label="刀水橋" sub="最後の目撃" p={p2} hot dx={-200} dy={-20} />
      <g opacity={p2}>
        <T x={south.x - 170} y={south.y + 10} size={46} weight={900} fill={color.accentOnDark}>
          埼玉方面へ
        </T>
      </g>
      <Source>位置は目安　出典：FNNの報道（2024年）</Source>
    </Svg>
  );
};

// 時効の時系列。step 1：1998年の事件、step 2：2010年の時効廃止、step 3：2026年の今
const Timeline: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  const y = 430;
  const pts = [
    { x: 330, year: "1998年1月", what: "事件", sub: "一家3人が殺害", step: 1 },
    { x: 960, year: "2010年4月", what: "時効の廃止", sub: "殺人罪など", step: 2, hot: true },
    { x: 1590, year: "2026年11月", what: "今も手配中", sub: "容疑者は57歳", step: 2 },
  ];
  return (
    <Svg>
      <Heading>時効のない事件</Heading>
      <line x1={180} y1={y} x2={W - 180} y2={y} stroke={color.line} strokeWidth={8} opacity={reveal(1)} />
      {pts.map((p, i) => {
        const o = reveal(p.step, i * 10);
        return (
          <g key={p.year} opacity={o}>
            <circle cx={p.x} cy={y} r={24} fill={p.hot ? color.accent : color.cool} stroke={color.ink} strokeWidth={4} />
            <T x={p.x} y={y - 90} size={52} weight={900} fill={p.hot ? color.accentOnDark : color.ink}>
              {p.year}
            </T>
            <Card x={p.x - 230} y={y + 60} w={460} h={170} highlight={p.hot ? 1 : 0} />
            <T x={p.x} y={y + 118} size={54} weight={900}>
              {p.what}
            </T>
            <T x={p.x} y={y + 186} size={36} fill={color.inkSoft}>
              {p.sub}
            </T>
          </g>
        );
      })}
      <Source>出典：警察庁 犯罪被害者白書・捜査特別報奨金の広告</Source>
    </Svg>
  );
};

// 情報提供の窓口（警察庁の広告）
const Contact: React.FC<{ steps: StepFrames }> = ({ steps }) => {
  const { reveal } = useSteps(steps);
  return (
    <Svg>
      <Heading>情報提供のお願い</Heading>
      <g opacity={reveal(1)}>
        <Card x={260} y={190} w={W - 520} h={420} highlight={1} />
        <T x={W / 2} y={270} size={44} fill={color.inkSoft}>
          群馬県 高崎北警察署 捜査本部
        </T>
        <T x={W / 2} y={350} size={46} weight={900}>
          フリーダイヤル
        </T>
        <T x={W / 2} y={450} size={120} weight={900} fill={color.accentOnDark}>
          0120-547-590
        </T>
        <T x={W / 2} y={560} size={40} fill={color.inkSoft}>
          捜査特別報奨金 上限300万円（2027年10月31日まで）
        </T>
      </g>
      <Source>出典：警察庁 捜査特別報奨金の広告</Source>
    </Svg>
  );
};

export const DIAGRAMS: Diagrams = { route: Route, timeline: Timeline, contact: Contact };
