import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Atlas | Digital twin",
  description: "Explore the HKSTP and CUHK campuses in an interactive Three.js digital twin. Inspect mapped buildings, landscape layers and your own 3D models.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
