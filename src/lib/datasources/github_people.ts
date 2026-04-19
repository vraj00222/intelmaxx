// GitHub people enrichment — given an org login (or a user best-guess), surface
// the top repos and the real humans behind them: name, blog, x handle (from
// twitter_username field), bio, location. Used by the case-file agent to build
// an "every employee" view for a single company.
//
// Rate limits: unauthenticated GitHub allows 60 req/hr; with GITHUB_TOKEN it's
// 5000/hr. We bound this module to ~1 org lookup + 3 repo lookups + up to 15
// user lookups per case file, so a single token covers hundreds of case files.

const GH_BASE = "https://api.github.com";

function ghHeaders(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    (h as Record<string, string>)["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

async function gh<T>(path: string, timeoutMs = 6000): Promise<T | null> {
  try {
    const res = await fetch(`${GH_BASE}${path}`, {
      headers: ghHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type GHOrg = {
  login: string;
  name?: string | null;
  description?: string | null;
  blog?: string | null;
  location?: string | null;
  twitter_username?: string | null;
  public_repos?: number;
  html_url?: string;
  avatar_url?: string;
};

export type GHUser = {
  login: string;
  id: number;
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  twitter_username?: string | null;
  bio?: string | null;
  public_repos?: number;
  followers?: number;
  html_url?: string;
  avatar_url?: string;
  type?: "User" | "Organization";
};

export type GHOrgRepo = {
  name: string;
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
};

export type GHContributor = {
  login: string;
  contributions: number;
  avatar_url: string;
  html_url: string;
};

/** Look up an org directly; returns null if the login doesn't match an org. */
export async function getOrg(login: string): Promise<GHOrg | null> {
  return gh<GHOrg>(`/orgs/${encodeURIComponent(login)}`);
}

/** Hydrate a single user login with profile fields. */
export async function getUser(login: string): Promise<GHUser | null> {
  return gh<GHUser>(`/users/${encodeURIComponent(login)}`);
}

/**
 * Best-effort org/user login for a company name.
 *
 * GitHub's search `in:name` qualifier is weirdly strict — it misses plenty of
 * valid orgs (e.g. "InsForge" returns zero hits with `in:name type:org` even
 * though `/orgs/insforge` is a live 200). Strategy:
 *   1. Try direct `/orgs/{slug}` + `/users/{slug}` lookups in parallel for the
 *      obvious slug variants. A direct hit is both cheaper and more accurate
 *      than search.
 *   2. Only on miss, fall back to an unqualified `?q={name}` search and pick
 *      the best-normalized match, preferring Organization over User.
 */
export async function findOrgByCompanyName(company: string): Promise<string | null> {
  const q = company.trim();
  if (!q) return null;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const base = norm(q);
  if (!base) return null;

  // Generate cheap slug variants — dashed, with AI suffix, etc.
  const dashed = q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const variants = [base, dashed, `${base}ai`, `${base}-ai`, `${base}hq`, `${base}io`]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .slice(0, 6);

  // 1) Direct lookups in parallel — first successful org wins; user as fallback.
  const direct = await Promise.all(
    variants.map(async (v) => ({ variant: v, org: await getOrg(v) }))
  );
  const orgHit = direct.find((d) => d.org)?.org?.login;
  if (orgHit) return orgHit;

  // Check users for the base slug only (cheaper).
  const userHit = await getUser(base);
  if (userHit && userHit.type === "User") return userHit.login;
  if (userHit) return userHit.login; // Organization returned from /users works too

  // 2) Search fallback WITHOUT `in:name` qualifier — it's unreliable.
  const search = await gh<{
    items: Array<{ login: string; type: string }>;
  }>(`/search/users?q=${encodeURIComponent(q)}&per_page=5`);
  const items = search?.items || [];
  if (!items.length) return null;

  // Prefer orgs, then exact-ish normalized match, then first.
  const orgs = items.filter((i) => i.type === "Organization");
  const exactOrg = orgs.find((i) => norm(i.login) === base);
  if (exactOrg) return exactOrg.login;
  if (orgs.length) return orgs[0].login;

  const exactAny = items.find((i) => norm(i.login) === base);
  return exactAny?.login || items[0].login || null;
}

/** Top repos for an org/user, sorted by stars. */
export async function listOrgRepos(login: string, limit = 6): Promise<GHOrgRepo[]> {
  const data = await gh<GHOrgRepo[]>(
    `/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=30`
  );
  if (!data) return [];
  return data
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, limit);
}

/** Top contributors for a single repo (login + contribution count). */
export async function listRepoContributors(
  owner: string,
  repo: string,
  limit = 12
): Promise<GHContributor[]> {
  const data = await gh<GHContributor[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=${limit}`
  );
  return data || [];
}

export type EnrichedContributor = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  blog: string | null;
  location: string | null;
  twitter_username: string | null;
  x_url: string | null;
  linkedin_guess: string | null; // google-searchable URL, not a direct profile
  contributions: number;
  seen_in_repos: string[];
  type: "User" | "Organization";
};

/**
 * Given an org, return the merged set of unique contributors across the top
 * repos — deduped, enriched with full profile fields, and ranked by total
 * contribution count. Bounds: top 3 repos × 12 contributors × 1 user-lookup ≈
 * 36 GitHub calls in the worst case. We cap user-lookups at 15 to stay safe.
 */
export async function findOrgContributors(
  login: string,
  repoLimit = 3,
  userCap = 15
): Promise<{ repos: GHOrgRepo[]; contributors: EnrichedContributor[] }> {
  const repos = await listOrgRepos(login, repoLimit);
  if (!repos.length) return { repos: [], contributors: [] };

  // Collect contributor logins across the top repos.
  const perRepo = await Promise.all(
    repos.map(async (r) => {
      const [owner, name] = r.full_name.split("/");
      return { repo: r, contributors: await listRepoContributors(owner, name, 12) };
    })
  );

  const merged = new Map<
    string,
    { contributions: number; seen_in_repos: string[]; avatar_url: string; html_url: string }
  >();
  for (const { repo, contributors } of perRepo) {
    for (const c of contributors) {
      if (!c.login || c.login.endsWith("[bot]")) continue;
      const prev = merged.get(c.login);
      if (prev) {
        prev.contributions += c.contributions;
        if (!prev.seen_in_repos.includes(repo.name)) prev.seen_in_repos.push(repo.name);
      } else {
        merged.set(c.login, {
          contributions: c.contributions,
          seen_in_repos: [repo.name],
          avatar_url: c.avatar_url,
          html_url: c.html_url,
        });
      }
    }
  }

  // Rank, cap, then hydrate top N with profile details in parallel.
  const ranked = [...merged.entries()]
    .sort((a, b) => b[1].contributions - a[1].contributions)
    .filter(([loginName]) => loginName.toLowerCase() !== login.toLowerCase())
    .slice(0, userCap);

  const hydrated: EnrichedContributor[] = await Promise.all(
    ranked.map(async ([loginName, meta]) => {
      const u = await getUser(loginName);
      const twitter = u?.twitter_username || null;
      const name = u?.name || null;
      return {
        login: loginName,
        name,
        avatar_url: meta.avatar_url,
        html_url: meta.html_url,
        bio: u?.bio || null,
        blog: u?.blog || null,
        location: u?.location || null,
        twitter_username: twitter,
        x_url: twitter ? `https://x.com/${twitter}` : null,
        linkedin_guess: name
          ? `https://www.google.com/search?q=${encodeURIComponent(
              `${name} site:linkedin.com/in`
            )}`
          : null,
        contributions: meta.contributions,
        seen_in_repos: meta.seen_in_repos,
        type: u?.type || "User",
      };
    })
  );

  return { repos, contributors: hydrated };
}
