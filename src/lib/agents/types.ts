export type MissionType = "hiring" | "oss_contrib" | "research" | "general";

export type MissionBrief = {
  raw: string;
  industry: string;
  stage: string;
  role_type: string;
  location: string;
  keywords: string[];
  mission_type: MissionType;
};

export type FundingIntel = {
  company_name: string;
  url: string;
  funding_amount: string;
  funding_stage: "pre-seed" | "seed" | "series-a" | "series-b" | "later" | "unknown";
  investors: string[];
  industry: string;
  date: string;
  relevance_score: number;
  one_liner: string;
  likely_to_hire?: boolean;
  gallery_url?: string;
  company_url?: string;
};

export type HiringSignal = {
  company_name: string;
  signal_type: "explicit_hiring" | "implicit_growth" | "team_expansion";
  source_url: string;
  apply_url?: string | null;
  signal_text: string;
  role_hints: string[];
  confidence: "high" | "medium" | "low";
  urgency: "fresh" | "recent" | "aging";
  gallery_url?: string;
};

export type OSSIntel = {
  company_name: string;
  repo_url: string;
  stars: number;
  recent_activity_score: number;
  has_contributing_guide: boolean;
  good_first_issues_count: number;
  oss_hiring_correlation: "high" | "medium" | "low";
  entry_strategy: string;
};

export type RedFlag = {
  signal: string;
  evidence: string;
  subreddit: string;
  permalink: string;
  score: number;
};

export type TopTarget = {
  rank: number;
  company_name: string;
  composite_score: number;
  signals: string[];
  action_items: string[];
  rationale: string;
  red_flags?: RedFlag[];
};

export type MoatBriefing = {
  company_name: string;
  text: string;
};

export type ProfilerReport = {
  top_targets: TopTarget[];
  intel_briefing_text: string;
  intel_briefing_voice: string;
  moat_briefings?: MoatBriefing[];
  total_companies_analyzed: number;
  total_signals_detected: number;
};

// ─── LIKELY HIRING dossier — replaces/augments top_targets for hiring missions ───

export type PersonDossier = {
  name: string | null;
  title: "CEO" | "CTO" | "Founder";
  x_url: string | null;
  linkedin_url: string | null;
  email_patterns: string[];
};

export type RedditChatterItem = {
  headline: string;
  excerpt?: string;
  subreddit: string;
  permalink: string;
  score: number;
  matched?: string;
};

export type LikelyHiringDossier = {
  company_name: string;
  domain: string | null;
  source: "funding" | "yc" | "gallery";
  source_label: string; // human-readable e.g. "FOXHOUND: Series A · $4.2M"
  one_liner: string;
  funding_amount?: string;
  funding_stage?: string;
  funding_date?: string;
  yc_batch?: string;
  team_size?: number;
  age_years?: number;
  url?: string; // canonical company URL / news URL
  ceo: PersonDossier | null;
  cto: PersonDossier | null;
  engineers_linkedin: string[];
  reddit_positive: RedditChatterItem[];
  reddit_red_flags: RedditChatterItem[];
  reddit_hiring_buzz: RedditChatterItem[];
  cold_email_subject: string;
  cold_email_body: string;
  gate_reasons: string[];
};

export type AgentStatus = "standby" | "deployed" | "investigating" | "intel_acquired" | "failed";

export type AgentCode = "FOXHOUND" | "WIRETAP" | "GHOSTNET" | "PROFILER";

export type InvestigationPayload = {
  mission: MissionBrief;
  funding: FundingIntel[];
  signals: HiringSignal[];
  oss: OSSIntel[];
  profiler: ProfilerReport;
  likely_hiring: LikelyHiringDossier[];
  case_number: string;
  elapsed_ms: number;
};
