// GitHub API — optional PAT via GITHUB_TOKEN for higher rate limits.
const GH_BASE = "https://api.github.com";

export type GHRepo = {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  pushed_at: string;
  language: string | null;
  topics?: string[];
};

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

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GH_BASE}${path}`, {
    headers: ghHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GH ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function searchRepos(query: string, perPage = 12): Promise<GHRepo[]> {
  const q = encodeURIComponent(query);
  const data = await gh<{ items: GHRepo[] }>(
    `/search/repositories?q=${q}&sort=stars&order=desc&per_page=${perPage}`
  );
  return data.items || [];
}

export async function countGoodFirstIssues(owner: string, repo: string): Promise<number> {
  try {
    const data = await gh<{ total_count: number }>(
      `/search/issues?q=${encodeURIComponent(
        `repo:${owner}/${repo} is:issue is:open label:"good first issue"`
      )}&per_page=1`
    );
    return data.total_count ?? 0;
  } catch {
    return 0;
  }
}

export async function hasContributingGuide(owner: string, repo: string): Promise<boolean> {
  try {
    const res = await fetch(`${GH_BASE}/repos/${owner}/${repo}/contents/CONTRIBUTING.md`, {
      headers: ghHeaders(),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
