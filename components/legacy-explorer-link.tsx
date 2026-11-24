"use client";

import { useEffect } from "react";
import { legacyExplorerHref } from "@/lib/legacy-explorer-link";

export default function LegacyExplorerLink() {
  useEffect(() => {
    const target = legacyExplorerHref(window.location.search, window.location.hash);
    if (target) window.location.replace(target);
  }, []);

  return null;
}
