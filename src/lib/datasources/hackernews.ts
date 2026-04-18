// Hacker News via Algolia API — no auth, no rate limits in practice.
const HN_BASE = "https://hn.algolia.com/api/v1";

export type HNHit = {
  objectID: string;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  story_text?: string | null;
  comment_text?: string | null;
  created_at?: string | null;
  num_comments?: number | null;
};

async function hn<T>(path: string): Promise<T> {
  const res = await fetch(`${HN_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HN ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function searchStories(query: string, hitsPerPage = 15): Promise<HNHit[]> {
  const q = encodeURIComponent(query);
  const data = await hn<{ hits: HNHit[] }>(
    `/search?query=${q}&tags=story&hitsPerPage=${hitsPerPage}`
  );
  return data.hits || [];
}

export async function searchShowHN(query: string, hitsPerPage = 12): Promise<HNHit[]> {
  const q = encodeURIComponent(query);
  const data = await hn<{ hits: HNHit[] }>(
    `/search?query=${q}&tags=show_hn&hitsPerPage=${hitsPerPage}`
  );
  return data.hits || [];
}

/** Find the most recent "Ask HN: Who is hiring?" thread ID. */
export async function findWhoIsHiringThread(): Promise<HNHit | null> {
  const data = await hn<{ hits: HNHit[] }>(
    `/search?query=${encodeURIComponent("Ask HN: Who is hiring?")}&tags=story,author_whoishiring&hitsPerPage=1`
  );
  return data.hits?.[0] || null;
}

type HNComment = {
  id: number;
  text?: string | null;
  author?: string | null;
  children?: HNComment[];
  created_at?: string | null;
};

/** Fetch top-level "who is hiring" comments (each = a hiring post). */
export async function fetchHiringComments(threadId: string, limit = 25): Promise<HNComment[]> {
  const data = await hn<{ children?: HNComment[] }>(`/items/${threadId}`);
  const kids = (data.children || []).filter((c) => c.text && c.text.length > 40);
  return kids.slice(0, limit);
}
