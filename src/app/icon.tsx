import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050812",
          borderRadius: 10,
          color: "#c6a661",
          fontSize: 16,
          fontWeight: 800,
        }}
      >
        お
      </div>
    ),
    { ...size }
  );
}
