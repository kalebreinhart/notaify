import { renderSVG } from "uqr";

export function qrSvg(payload: string): string {
  const svg = renderSVG(payload, {
    ecc: "M",
    border: 2,
    pixelSize: 8,
    blackColor: "#111111",
    whiteColor: "#ffffff",
  });
  if (!svg.startsWith("<svg ") || svg.includes("<script")) {
    throw new Error("QR encoder returned an unexpected document");
  }
  return svg;
}
