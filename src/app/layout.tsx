import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TSIN · 招聘工作台",
  description: "用自然语言查询招聘进展，核对后推进候选人流程。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
