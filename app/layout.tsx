import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHILLSPACE — Không gian giao lưu trực tuyến trong thế giới ảo",
  description:
    "Bước vào một quán cà phê pixel art, chọn một chiếc bàn, bật nhạc thư giãn và dành thời gian cùng những người bạn yêu quý.",
  applicationName: "CHILLSPACE",
};

export const viewport: Viewport = {
  themeColor: "#F5EBDD",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
