"use client";

import { QRCodeSVG } from "qrcode.react";

export function CheckinQR({ value, size = 180 }: { value: string; size?: number }) {
  return (
    <div className="inline-flex rounded-xl bg-white p-3">
      <QRCodeSVG value={value} size={size} level="M" aria-label="Your gym check-in QR code" />
    </div>
  );
}
