const explorerKeys = ["campus", "selected", "plan", "start", "destination"];

export function legacyExplorerHref(search: string, hash: string): string | null {
  const params = new URLSearchParams(search);
  return explorerKeys.some(key => params.has(key)) ? `/explore${search}${hash}` : null;
}
