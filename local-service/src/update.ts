export interface UpdateRelease {
  tag: string;
  version: string;
  name: string;
  url: string;
  publishedAt: string;
  notes: string;
  prerelease: boolean;
}

export interface UpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  latestTag: string | null;
  hasUpdate: boolean;
  releaseName: string | null;
  releaseUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
  checkedAt: string;
  error: string | null;
}

export function versionParts(value: string): number[] {
  return value.replace(/^v/i, "").split(/[.+-]/).map((part) => Number.parseInt(part, 10)).filter(Number.isFinite);
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export async function fetchLatestRelease(fetcher: typeof fetch = fetch): Promise<UpdateRelease> {
  const response = await fetcher("https://api.github.com/repos/jackdsjk/Monash-Cove/releases?per_page=10", {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "Cove-Update-Check",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub releases returned HTTP ${response.status}.`);
  const releases = (await response.json()) as GitHubRelease[];
  const candidates = releases
    .filter((release) => !release.draft && release.tag_name && release.html_url)
    .map((release) => ({ ...release, version: release.tag_name!.replace(/^v/i, "") }))
    .filter((release) => versionParts(release.version).length > 0)
    .sort((a, b) => compareVersions(b.version, a.version));
  const latest = candidates[0];
  if (!latest?.tag_name || !latest.html_url) throw new Error("GitHub releases response did not contain a release.");
  return {
    tag: latest.tag_name,
    version: latest.version,
    name: latest.name ?? latest.tag_name,
    url: latest.html_url,
    publishedAt: latest.published_at ?? "",
    notes: (latest.body ?? "").slice(0, 1200),
    prerelease: Boolean(latest.prerelease),
  };
}

export function buildUpdateStatus(currentVersion: string, latest: UpdateRelease | null, error: string | null = null): UpdateStatus {
  return {
    currentVersion,
    latestVersion: latest?.version ?? null,
    latestTag: latest?.tag ?? null,
    hasUpdate: Boolean(latest && compareVersions(latest.version, currentVersion) > 0),
    releaseName: latest?.name ?? null,
    releaseUrl: latest?.url ?? null,
    publishedAt: latest?.publishedAt ?? null,
    notes: latest?.notes ?? null,
    checkedAt: new Date().toISOString(),
    error,
  };
}
