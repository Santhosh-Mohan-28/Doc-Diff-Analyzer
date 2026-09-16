import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Difference Analyzer",
  description:
    "AI-powered semantic comparison of two PDF document versions. Identify meaningful changes with evidence-backed analysis.",
  keywords: [
    "document comparison",
    "PDF comparison",
    "semantic comparison",
    "document difference analyzer",
    "AI document analysis",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f7f8fc] text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}