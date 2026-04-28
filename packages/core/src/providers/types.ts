export interface PageBlock {
  subpages: string[];
  text: Record<string, string>;
}

export interface TeletextData {
  data: Record<string, PageBlock>;
  timestamp: number | string;
}

export type TopicKey =
  | "news"
  | "news_domestic"
  | "news_world"
  | "news_regional"
  | "weather"
  | "sport"
  | "economy"
  | "tv_program"
  | "interests";

export interface TopicEntry {
  label: string;
  pages: string[];
}

export type TopicTable = Partial<Record<TopicKey, TopicEntry>>;

export interface Provider {
  /** Short broadcaster slug used as the slash-command suffix and cache key (e.g. "ct", "ard"). */
  code: string;
  /** Display name shown in headers (e.g. "ČT Teletext"). */
  label: string;
  /** Full broadcaster name (e.g. "Česká televize"). */
  broadcaster: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "CZ", "DE"). */
  country: string;
  /** Country name in English for human-readable listings (e.g. "Czechia", "Germany"). */
  countryName: string;
  /** Primary content language as ISO 639-1 (e.g. "cs", "de"). */
  language: string;
  /** One-line description: who runs it, what's special. Shown in `/teletext:list`. */
  description: string;
  /** Bulk-fetch JSON endpoint (or other provider-specific URL). */
  apiUrl: string;
  /** Country-specific topic map. */
  topics: TopicTable;
  indexPage?: string;
  acceptLanguage?: string;
  userAgent?: string;
  cacheTtlMs?: number;
  fetchTimeoutMs?: number;
  indexLineRegex?: RegExp;
  /**
   * Custom fetcher for broadcasters whose endpoint shape differs from ČT's bulk JSON.
   * If absent, the default fetcher GETs `apiUrl` and expects a `{ data: {...} }` payload.
   * If present, the provider is fully responsible for returning a normalized `TeletextData`.
   */
  fetchSnapshot?: (provider: Provider) => Promise<TeletextData>;
}

export interface ProviderSummary {
  code: string;
  label: string;
  broadcaster: string;
  country: string;
  countryName: string;
  language: string;
  description: string;
}

export function summarize(p: Provider): ProviderSummary {
  return {
    code: p.code,
    label: p.label,
    broadcaster: p.broadcaster,
    country: p.country,
    countryName: p.countryName,
    language: p.language,
    description: p.description,
  };
}
