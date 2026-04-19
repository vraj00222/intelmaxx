// Web search via DuckDuckGo HTML endpoint. No API key, no quota, but HTML is
// lightly rate-limited — keep parallel calls to <=4 and cache results.
//
// DDG returns a results page with <a class="result__a" href="..."> tags.
// The href is a DDG redirect (`/l/?uddg=...`); the true URL is the uddg param.

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const DDG = "https://duckduckgo.com/html/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const cache = new Map<string, { at: number; hits: SearchHit[] }>();
const TTL_MS = 15 * 60 * 1000; // 15 min — people/handle links don't move fast

function decodeDDGRedirect(href: string): string {
  try {
    if (href.startsWith("//duckduckgo.com/l/") || href.startsWith("/l/")) {
      const u = new URL(href.startsWith("//") ? `https:${href}` : `https://duckduckgo.com${href}`);
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    if (href.startsWith("http")) return href;
    return href;
  } catch {
    return href;
  }
}

function parseResults(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  // Each result block:
  //   <a rel="nofollow" class="result__a" href="...">TITLE</a>
  //   ...
  //   <a class="result__snippet" ...>SNIPPET</a>
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && hits.length < 25) {
    const url = decodeDDGRedirect(m[1]);
    const title = stripTags(m[2]).trim();
    const snippet = stripTags(m[3] || "").trim();
    if (!url || !title) continue;
    hits.push({ title, url, snippet });
  }
  return hits;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchWeb(query: string, limit: number = 10): Promise<SearchHit[]> {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.hits.slice(0, limit);

  try {
    const res = await fetch(DDG, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      body: `q=${encodeURIComponent(query)}&kl=us-en`,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits = parseResults(html);
    cache.set(key, { at: Date.now(), hits });
    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Narrow search helpers that return the first matching URL only — used heavily
 * by the people-discovery pipeline where we just want "does this exist? if so
 * where?" not a ranked list.
 */
export async function findFirst(query: string, urlPrefix: string): Promise<string | null> {
  const hits = await searchWeb(query, 8);
  const prefLow = urlPrefix.toLowerCase();
  const h = hits.find((h) => h.url.toLowerCase().includes(prefLow));
  return h?.url || null;
}
