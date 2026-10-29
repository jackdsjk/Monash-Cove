import type { BriefItem, SourceStatus } from "../types";

export interface BriefData {
  items: BriefItem[];
  sources: SourceStatus[];
  syncedAt: string | null;
  lastCheckedAt: string | null;
}

const API = "/api";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Local API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/** The UI contract is a list of normalized items; the service owns source access. */
export async function fetchBrief(): Promise<BriefData> {
  return getJson<BriefData>("/brief");
}

export async function fetchSources(): Promise<SourceStatus[]> {
  const data = await getJson<{ sources: SourceStatus[] }>("/sources");
  return data.sources;
}
