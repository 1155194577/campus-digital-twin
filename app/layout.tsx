import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "meshPotato",
  description: "3D engineering and spatial technology, from data to fabrication.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
