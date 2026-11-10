import type { Metadata } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Source_Serif_4({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-display",
});

const body = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "QALQAN · Геолокация",
  description:
    "Модуль геолокации и учёта визитов для Битрикс24 без Clockster: карта, журнал дня, справочник мест.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
