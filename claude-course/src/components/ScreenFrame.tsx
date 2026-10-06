import React from "react";
import { Easing, Freeze, Html5Video, Img, OffthreadVideo, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { color, font, screen } from "../theme/tokens";

/** A rectangle in the media's own pixels. */
export type Rect = { x: number; y: number; w: number; h: number };

export type Media = { kind: "image" | "video"; src: string; width: number; height: number };

/**
 * One piece of a recording, in frames relative to the scene start: from `at`
 * it plays source seconds [from, to] (at `rate`, default 1), then holds the
 * last frame until the next segment starts.
 */
export type VideoSegment = { at: number; from: number; to: number; rate?: number };

/** A highlight box over the screen, in the media's pixels. */
export type ScreenMark = { rect: Rect; opacity: number };

export const BAR = 40;
const ZOOM_FRAMES = 45;

/** The view rect `frame` frames into a zoom from `from` to `to` starting at `at`. */
export const zoomView = (from: Rect, to: Rect, frame: number, at: number): Rect => {
  const t = interpolate(frame, [at, at + ZOOM_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const mix = (a: number, b: number) => a + (b - a) * t;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) };
};

/**
 * `html5`: decode in the browser (<Html5Video>) instead of Remotion's
 * compositor (<OffthreadVideo>). Used for the free trial video because
 * Windows Smart App Control on this PC blocks the compositor's DLLs; the
 * edited clips are constant 30fps h264 with a keyframe every second.
 */
const VideoSegments: React.FC<{ src: string; segments: VideoSegment[]; html5?: boolean }> = ({ src, segments, html5 }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {segments.map((seg, i) => {
        const next = segments[i + 1];
        const length = next ? next.at - seg.at : 100000;
        const rate = seg.rate ?? 1;
        const playFrames = Math.max(1, Math.round(((seg.to - seg.from) / rate) * fps));
        const videoProps = {
          src: staticFile(src),
          muted: true,
          playbackRate: rate,
          trimBefore: Math.round(seg.from * fps),
          style: { width: "100%", height: "100%" },
        };
        const video = html5 ? <Html5Video {...videoProps} /> : <OffthreadVideo {...videoProps} />;
        return (
          <Sequence key={`${seg.at}-${seg.from}`} from={seg.at} durationInFrames={length} layout="none">
            <Sequence durationInFrames={playFrames} layout="none">
              {video}
            </Sequence>
            <Sequence from={playFrames} layout="none">
              <Freeze frame={playFrames - 1}>{video}</Freeze>
            </Sequence>
          </Sequence>
        );
      })}
    </>
  );
};

/** Small pill in the frame's top bar ("変更前", "早送り" ...). */
const BarPill: React.FC<{ text: string; accent?: boolean }> = ({ text, accent }) => (
  <div
    style={{
      fontSize: 22,
      fontWeight: font.bold,
      lineHeight: 1,
      padding: "6px 14px",
      borderRadius: 999,
      whiteSpace: "pre",
      color: accent ? color.cyan : color.text,
      backgroundColor: accent ? color.primarySoft : "rgba(255,255,255,0.08)",
      border: `1px solid ${accent ? color.borderAccent : color.frameBorderSoft}`,
    }}
  >
    {text}
  </div>
);

/**
 * A member-site screenshot or recording shown as "the real screen": kept in
 * its own light colors, inside a dark browser-like frame with a soft shadow,
 * on the dark video. `view` is the part of the media visible (zoom / crop);
 * the viewport's aspect follows the view, so nothing is stretched.
 * Optional: `label` (left of the top bar), `badge` (right, accent) and
 * `marks` (highlight boxes over the media). The bar sits above the media,
 * so none of these cover the screen's own content.
 */
export const ScreenFrame: React.FC<{
  media: Media;
  /** Viewport width in px. */
  width: number;
  view?: Rect;
  segments?: VideoSegment[];
  label?: string;
  badge?: string;
  marks?: ScreenMark[];
  html5Video?: boolean;
}> = ({ media, width, view, segments, label, badge, marks, html5Video }) => {
  const v = view ?? { x: 0, y: 0, w: media.width, h: media.height };
  const scale = width / v.w;
  const height = Math.round(v.h * scale);
  return (
    <div
      style={{
        width,
        borderRadius: screen.radius,
        overflow: "hidden",
        backgroundColor: screen.frame,
        border: `1px solid ${screen.frameBorder}`,
        boxShadow: screen.shadow,
      }}
    >
      <div style={{ height: BAR, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: color.border }} />
        ))}
        {label && (
          <div style={{ marginLeft: 8 }}>
            <BarPill text={label} />
          </div>
        )}
        {badge && (
          <div style={{ marginLeft: "auto" }}>
            <BarPill text={badge} accent />
          </div>
        )}
      </div>
      <div style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: "#FFFFFF" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: media.width,
            height: media.height,
            transformOrigin: "0 0",
            transform: `translate(${-v.x * scale}px, ${-v.y * scale}px) scale(${scale})`,
          }}
        >
          {media.kind === "image" ? (
            <Img src={staticFile(media.src)} style={{ width: "100%", height: "100%" }} />
          ) : (
            <VideoSegments src={media.src} segments={segments ?? [{ at: 0, from: 0, to: 1000 }]} html5={html5Video} />
          )}
        </div>
        {(marks ?? []).map((m, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (m.rect.x - v.x) * scale,
              top: (m.rect.y - v.y) * scale,
              width: m.rect.w * scale,
              height: m.rect.h * scale,
              opacity: m.opacity,
              border: `5px solid ${color.primary}`,
              borderRadius: 10,
              backgroundColor: "rgba(79,143,247,0.08)",
              boxSizing: "border-box",
            }}
          />
        ))}
      </div>
    </div>
  );
};
