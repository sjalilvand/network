import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "NetScope — سامانه هوشمند کشف، تحلیل و مانیتورینگ شبکه",
  description:
    "پرونده زنده و مستند شبکه: جمع‌آوری خودکار اطلاعات، چک‌لیست خودتکمیل‌شونده، نقشه فیزیکی/منطقی/کاربردی، نظارت تصویری، مانیتورینگ تطبیقی و تحلیل مبتنی بر شواهد.",
  keywords: ["NetScope", "کشف شبکه", "نقشه شبکه", "مانیتورینگ", "دوربین IP", "NVR", "SNMP", "ONVIF"],
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
