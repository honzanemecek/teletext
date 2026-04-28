import type { Provider, ProviderSummary } from "./types.js";
import { summarize } from "./types.js";
import { ct } from "./ct.js";
import { svt } from "./svt.js";

const PROVIDERS: Record<string, Provider> = {
  [ct.code]: ct,
  [svt.code]: svt,
};

export function getProvider(code: string): Provider | undefined {
  return PROVIDERS[code];
}

export function listProviders(): Provider[] {
  return Object.values(PROVIDERS);
}

export function listProviderCodes(): string[] {
  return Object.keys(PROVIDERS);
}

/**
 * Filter providers by a free-form term (case-insensitive). Matching strategy:
 *   - Short terms (≤ 2 chars) match exactly against code, country (alpha-2), and language (alpha-2).
 *     This avoids "de" matching "Television" via substring.
 *   - Longer terms also substring-match against broadcaster name, countryName, and label.
 * Empty/undefined term returns all providers.
 */
export function findProviders(term?: string): Provider[] {
  if (!term) return listProviders();
  const t = term.trim().toLowerCase();
  if (!t) return listProviders();
  return listProviders().filter((p) => {
    const exact = [p.code, p.country, p.language].map((s) => s.toLowerCase());
    if (exact.includes(t)) return true;
    if (t.length < 3) return false;
    const haystacks = [p.broadcaster, p.countryName, p.label].map((s) => s.toLowerCase());
    return haystacks.some((s) => s.includes(t));
  });
}

export function summarizeAll(): ProviderSummary[] {
  return listProviders().map(summarize);
}

export type { Provider, ProviderSummary, TopicKey, TopicTable, TopicEntry } from "./types.js";
