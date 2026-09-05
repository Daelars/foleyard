import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0c0a09",
          color: "#fafaf9",
        }}
      >
        <div style={{ fontSize: 32, color: "#f97316", marginBottom: 16 }}>
          FOLEYARD
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1 }}>
          Find the right sound before the idea disappears.
        </div>
        <div style={{ fontSize: 28, color: "#a8a29e", marginTop: 24 }}>
          Local-first browser for messy SFX folders and music cues.
        </div>
      </div>
    ),
    { ...size },
  );
}
