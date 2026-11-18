import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shared Claude — 仮想アカウント対応 Claude ワークスペース",
  description:
    "従量課金APIとプラン契約アカウントを共有し、仮想アカウントごとにチャット履歴・プロジェクト・コンテキストを分離できるClaudeラッパーアプリ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-[#191817] text-[#eceae4] flex flex-col">
        {children}
      </body>
    </html>
  );
}
