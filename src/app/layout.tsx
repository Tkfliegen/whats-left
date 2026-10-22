import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "What’s Left? | Your profitability workspace",
  description: "See what your business really keeps. AI analysis with deterministic validation and bounded decision support for small businesses.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" className="h-full antialiased"><body className="min-h-full flex flex-col"><div className="page-background" aria-hidden="true"><div /><div /><div /></div>{children}</body></html>;
}
