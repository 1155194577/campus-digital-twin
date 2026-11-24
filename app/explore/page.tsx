import type { Metadata } from "next";
import CampusApp from "@/components/campus-app";

export const metadata: Metadata = {
  title: "Campus Atlas | meshPotato",
  description: "Explore Hong Kong Science Park and CUHK in the Campus Atlas 3D geographic digital twin.",
};

export default function Explore() {
  return <CampusApp />;
}
