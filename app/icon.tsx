import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** אייקון אפליקציה — PWA / מסך הבית (ללא סמל דפדפן) */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, #ffe4e8 0%, #e8485f 42%, #7f1020 100%)",
          borderRadius: "22%",
        }}
      >
        <div
          style={{
            width: "44%",
            height: "44%",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.93)",
            boxShadow: "0 14px 48px rgba(0,0,0,0.28)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
