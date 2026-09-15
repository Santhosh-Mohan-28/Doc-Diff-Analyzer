import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Difference Analyzer",
  description:
    "AI-powered semantic comparison of two PDF document versions. Identifies meaningful changes — not just text differences.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
