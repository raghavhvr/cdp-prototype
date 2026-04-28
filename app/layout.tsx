import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "CDP Prototype — Emirates Draw",
  description:
    "Customer data platform prototype: unified user segmentation and activation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-brand-bg text-brand-text">
          <Nav />
          <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
          <footer className="max-w-7xl mx-auto px-6 py-8 text-brand-dim text-sm">
            CDP Prototype · For internal demonstration only · Dummy data
          </footer>
        </div>
      </body>
    </html>
  );
}
