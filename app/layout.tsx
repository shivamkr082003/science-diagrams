import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Science Diagram Maker",
  description: "AI-generated animated GCSE science diagrams, checked by code and reviewed by a human.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
