import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "سامانه عضویت حزب مؤتلفه اسلامی",
  description: "مدیریت فرم‌ها، درخواست‌ها و اعضای حزب مؤتلفه اسلامی",
  robots: { index: false, follow: false },
  icons: { icon: "/logo.png" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
