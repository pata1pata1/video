// Thumbnails for cat-abuse-law only, in designs other than pattern-01's.
// Rendered from their own entry so the shared Root stays untouched:
//   npx.cmd remotion still src/videos/cat-abuse-law/thumbs-entry.ts Thumb-D out/cat-abuse-law/thumbnail-D.png
import React from "react";
import { AbsoluteFill, Img, Still, staticFile } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/NotoSerifJP";
import { loadFont as loadDela } from "@remotion/google-fonts/DelaGothicOne";
import { font } from "../../theme";

const serif = `${loadSerif("normal", { weights: ["700", "900"], subsets: ["japanese", "latin"] }).fontFamily}, serif`;
const dela = `${loadDela("normal", { subsets: ["japanese", "latin"] }).fontFamily}, sans-serif`;

const RED = "#D7262E";
const PHOTO = "media/cat-abuse-law/image/w300h300z1l10t10q1000c2.jpg";
const CAT = "media/cat-abuse-law/frames/catface/0120.jpg";

/** Fine film grain so the small, upscaled photo looks intentional. */
const Grain: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity, mixBlendMode: "overlay" }}>
    <filter id="g">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
    </filter>
    <rect width="100%" height="100%" filter="url(#g)" />
  </svg>
);

// D：報道・ドキュメンタリー風（黒地・モノクロ写真・明朝・赤1色）
const Documentary: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#0B0B0B" }}>
    <div style={{ position: "absolute", right: 0, top: 0, width: 640, height: 720, overflow: "hidden" }}>
      <Img
        src={staticFile(PHOTO)}
        style={{ position: "absolute", width: 1100, height: 1100, left: -470, top: -10, objectFit: "cover", filter: "grayscale(1) contrast(1.15) brightness(0.9)" }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(90deg, #0B0B0B 0%, rgba(11,11,11,0.6) 30%, rgba(11,11,11,0) 60%), linear-gradient(0deg, #0B0B0B 0%, rgba(11,11,11,0) 35%)" }} />
      <Grain opacity={0.35} />
    </div>
    <div style={{ position: "absolute", left: 70, top: 70, width: 760 }}>
      <div style={{ display: "inline-block", fontFamily: font.body, fontWeight: 900, fontSize: 30, color: "#fff", background: RED, padding: "6px 18px", letterSpacing: "0.08em" }}>
        2017年 猫虐待事件
      </div>
      <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 92, color: "#fff", marginTop: 56, lineHeight: 1.15 }}>猫13匹を虐待して</div>
      <div style={{ fontFamily: serif, fontWeight: 900, fontSize: 190, color: RED, lineHeight: 1.1, letterSpacing: "-0.02em" }}>執行猶予</div>
      <div style={{ width: 120, height: 4, background: "#fff", margin: "40px 0 28px" }} />
      <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 40, color: "#E8E8E8" }}>なぜ刑務所に入らなかったのか</div>
    </div>
    <div style={{ position: "absolute", right: 40, bottom: 34, fontFamily: font.body, fontWeight: 700, fontSize: 24, color: "rgba(255,255,255,0.75)" }}>
      懲役1年10か月・執行猶予4年
    </div>
  </AbsoluteFill>
);

// E：シンプル・数字（生成りの紙・大きな「2年→5年」だけ）
const Numbers: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#F3EFE6" }}>
    <div style={{ position: "absolute", left: 80, top: 70, fontFamily: font.body, fontWeight: 900, fontSize: 46, color: "#222" }}>
      動物を殺す・傷つける罪の<span style={{ color: RED }}>上限</span>
    </div>
    <div style={{ position: "absolute", left: 80, top: 136, width: 140, height: 6, background: RED }} />
    <div style={{ position: "absolute", left: 0, right: 0, top: 190, display: "flex", alignItems: "baseline", justifyContent: "center", gap: 40 }}>
      <span style={{ fontFamily: dela, fontSize: 210, color: "#A8A39A" }}>2年</span>
      <span style={{ fontFamily: dela, fontSize: 120, color: "#A8A39A" }}>→</span>
      <span style={{ fontFamily: dela, fontSize: 330, color: RED, lineHeight: 1 }}>5年</span>
    </div>
    <div style={{ position: "absolute", left: 80, right: 80, bottom: 60, borderTop: "3px solid #222", paddingTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontFamily: font.body, fontWeight: 900, fontSize: 44, color: "#222" }}>猫13匹虐待事件のあと、法律はこう変わった</span>
      <span style={{ fontFamily: font.body, fontWeight: 700, fontSize: 28, color: "#555" }}>動物愛護法</span>
    </div>
  </AbsoluteFill>
);

// F：猫が主役（人物写真なし）
const CatFace: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000" }}>
    <Img src={staticFile(CAT)} style={{ position: "absolute", height: 720, width: 1280, objectFit: "cover", objectPosition: "20% center", left: -250, filter: "saturate(0.55) brightness(0.85)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 58%, #000 75%)" }} />
    <div style={{ position: "absolute", right: 70, top: 90, textAlign: "right" }}>
      <div style={{ fontFamily: dela, fontSize: 64, color: "#fff", lineHeight: 1.25 }}>
        <span style={{ fontSize: 150, lineHeight: 1 }}>13</span>匹の猫が
      </div>
      <div style={{ fontFamily: dela, fontSize: 64, color: "#fff", lineHeight: 1.4 }}>虐待されても</div>
      <div style={{ display: "inline-block", fontFamily: dela, fontSize: 120, color: "#fff", background: RED, padding: "4px 30px", marginTop: 18 }}>執行猶予</div>
      <div style={{ fontFamily: font.body, fontWeight: 900, fontSize: 38, color: "#ddd", marginTop: 40 }}>動物愛護法はどう変わった？</div>
    </div>
  </AbsoluteFill>
);

export const ThumbsRoot: React.FC = () => (
  <>
    <Still id="Thumb-D" component={Documentary} width={1280} height={720} />
    <Still id="Thumb-E" component={Numbers} width={1280} height={720} />
    <Still id="Thumb-F" component={CatFace} width={1280} height={720} />
  </>
);
