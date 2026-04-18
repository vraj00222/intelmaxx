// startups.gallery — Framer-built SPA. Content is JS-rendered, but the
// publisher ships a pre-built search index as JSON. We use that as a
// lightweight enrichment source: for each company we can infer stage,
// industry, location, and build a direct company page URL on
// startups.gallery/startups/<slug>.

// Re-extracting the current search-index URL from the landing page at
// request time is fragile; the index URLs are content-addressed hashes.
// Instead we derive from sitemap.xml (stable).

const SITEMAP = "https://startups.gallery/sitemap.xml";

export type StartupRef = {
  slug: string;
  url: string;
  name: string;
};

let _cache: { at: number; refs: StartupRef[] } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Returns a list of all startup-page refs known to startups.gallery.
 * Each ref includes a slug, a canonical URL, and a best-guess display name.
 */
export async function getStartupsGalleryIndex(): Promise<StartupRef[]> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.refs;
  try {
    const res = await fetch(SITEMAP, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const refs: StartupRef[] = [];
    for (const url of locs) {
      const m = url.match(/\/companies\/([a-z0-9-]+)\/?$/i);
      if (!m) continue;
      const slug = m[1];
      refs.push({
        slug,
        url,
        name: slug
          .split("-")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" "),
      });
    }
    _cache = { at: Date.now(), refs };
    return refs;
  } catch {
    return [];
  }
}

/**
 * Given a list of company names, returns a map of normalized name → ref.
 * Used to mark "also tracked on startups.gallery" / enrich with links.
 */
export async function matchStartupsGallery(
  names: string[]
): Promise<Map<string, StartupRef>> {
  const refs = await getStartupsGalleryIndex();
  const out = new Map<string, StartupRef>();
  if (!refs.length) return out;
  const bySlug = new Map(refs.map((r) => [r.slug, r]));
  for (const n of names) {
    const slug = n
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    const hit = bySlug.get(slug);
    if (hit) out.set(n.toLowerCase(), hit);
  }
  return out;
}
