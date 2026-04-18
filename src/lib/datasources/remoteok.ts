// RemoteOK — public JSON feed of remote jobs.
// https://remoteok.com/api  (first element is metadata, rest are jobs)

export type RemoteOKJob = {
  id: string;
  slug?: string;
  company?: string;
  company_logo?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  date?: string;
  epoch?: number;
};

export async function searchRemoteOK(
  keywords: string[],
  limit = 20
): Promise<RemoteOKJob[]> {
  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "IntelMaxxing/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RemoteOKJob[];
    // First entry is metadata — skip.
    const jobs = data.filter((j) => j && j.id && j.position);

    if (!keywords.length) return jobs.slice(0, limit);

    const lower = keywords.map((k) => k.toLowerCase());
    const matched = jobs.filter((j) => {
      const blob = [
        j.position,
        j.company,
        j.description,
        (j.tags || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return lower.some((k) => blob.includes(k));
    });
    return (matched.length ? matched : jobs).slice(0, limit);
  } catch {
    return [];
  }
}
