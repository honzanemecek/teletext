import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  PageBlock,
  Provider,
  TeletextData,
  TopicKey,
  TopicTable,
} from "./providers/types.js";

const ROOT_CACHE_DIR = join(homedir(), ".cache", "teletext");
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_INDEX_PAGE = "100";
// Global + Unicode so we can match multiple "TOPIC...123" entries on a single line
// (some broadcasters lay out two columns of topics per row).
const DEFAULT_INDEX_LINE_REGEX =
  /([\p{L}*][\p{L}* ]+?)\.{2,}\s*(\d{3}(?:[-,]\d{1,3})*)/gu;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type { PageBlock, TeletextData } from "./providers/types.js";

interface CacheEnvelope {
  fetchedAt: number;
  payload: TeletextData;
}

export interface SearchHit {
  page: string;
  subpage: string;
  snippet: string;
}

export interface PageListing {
  page: string;
  subpages: string[];
}

export interface TopicDescriptor {
  key: TopicKey;
  label: string;
  pages: string[];
}

export interface PageResult {
  page: string;
  subpage: string;
  availableSubpages: string[];
  text: string;
}

const memoryCache = new Map<string, CacheEnvelope>();

function cacheDir(code: string): string {
  return join(ROOT_CACHE_DIR, code);
}

function cacheFile(code: string): string {
  return join(cacheDir(code), "latest.json");
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function readCacheFile(code: string): Promise<CacheEnvelope | null> {
  try {
    const raw = await readFile(cacheFile(code), "utf8");
    return JSON.parse(raw) as CacheEnvelope;
  } catch {
    return null;
  }
}

async function writeCacheFile(code: string, env: CacheEnvelope): Promise<void> {
  const file = cacheFile(code);
  await ensureDir(dirname(file));
  await writeFile(file, JSON.stringify(env), "utf8");
}

async function fetchFromNetwork(provider: Provider): Promise<TeletextData> {
  if (provider.fetchSnapshot) {
    return provider.fetchSnapshot(provider);
  }
  const ctrl = new AbortController();
  const timeout = provider.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(provider.apiUrl, {
      headers: {
        "User-Agent": provider.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "application/json,*/*",
        "Accept-Language": provider.acceptLanguage ?? "en",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Teletext API returned HTTP ${res.status}`);
    }
    const json = (await res.json()) as TeletextData;
    if (!json || typeof json !== "object" || !json.data) {
      throw new Error("Teletext API returned unexpected payload shape");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export function stripPre(html: string): string {
  return html.replace(/^<pre>/i, "").replace(/<\/pre>\s*$/i, "");
}

function normalizeSubpage(raw: string | undefined, available: string[]): string {
  if (!available.length) return "";
  if (!raw) return available[0]!;
  const upper = raw.trim().toUpperCase();
  if (/^[A-Z]$/.test(upper) && available.includes(upper)) return upper;
  if (/^\d+$/.test(upper)) {
    const idx = parseInt(upper, 10) - 1;
    if (idx >= 0 && idx < available.length) return available[idx]!;
  }
  return available[0]!;
}

function topicDescriptors(topics: TopicTable): TopicDescriptor[] {
  return (Object.keys(topics) as TopicKey[])
    .filter((k) => topics[k] !== undefined)
    .map((k) => {
      const entry = topics[k]!;
      return { key: k, label: entry.label, pages: entry.pages };
    });
}

export interface ProviderApi {
  provider: Provider;
  fetchAll(opts?: { force?: boolean }): Promise<TeletextData>;
  getPage(page: string, subpage?: string): Promise<PageResult>;
  listPages(): Promise<PageListing[]>;
  getIndex(): Promise<{ raw: string; entries: Array<{ topic: string; pages: string }> }>;
  listTopics(): TopicDescriptor[];
  getTopic(topic: TopicKey): Promise<{ topic: TopicDescriptor; pages: PageResult[] }>;
  search(query: string, opts?: { caseSensitive?: boolean }): Promise<SearchHit[]>;
}

export function makeProviderApi(provider: Provider): ProviderApi {
  const ttl = provider.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  async function fetchAll(opts: { force?: boolean } = {}): Promise<TeletextData> {
    const force = opts.force === true;
    const now = Date.now();
    const cached = memoryCache.get(provider.code);

    if (!force && cached && now - cached.fetchedAt < ttl) {
      return cached.payload;
    }

    if (!force) {
      const onDisk = await readCacheFile(provider.code);
      if (onDisk && now - onDisk.fetchedAt < ttl) {
        memoryCache.set(provider.code, onDisk);
        return onDisk.payload;
      }
    }

    const payload = await fetchFromNetwork(provider);
    const env: CacheEnvelope = { fetchedAt: now, payload };
    memoryCache.set(provider.code, env);
    try {
      await writeCacheFile(provider.code, env);
    } catch {
      // Cache write failures are non-fatal; we still have the payload.
    }
    return payload;
  }

  async function getPage(page: string, subpage?: string): Promise<PageResult> {
    const all = await fetchAll();
    const block = all.data[page];
    if (!block) {
      const available = Object.keys(all.data).sort();
      throw new Error(
        `Page ${page} not found. Try one of: ${available.slice(0, 8).join(", ")}…`,
      );
    }
    const subs = block.subpages.length ? block.subpages : Object.keys(block.text);
    const chosen = normalizeSubpage(subpage, subs);
    const key = chosen ? `${page}${chosen}` : page;
    const html = block.text[key] ?? Object.values(block.text)[0] ?? "";
    return {
      page,
      subpage: chosen,
      availableSubpages: subs,
      text: stripPre(html),
    };
  }

  async function listPages(): Promise<PageListing[]> {
    const all = await fetchAll();
    return Object.keys(all.data)
      .sort()
      .map((p) => ({ page: p, subpages: all.data[p]!.subpages }));
  }

  async function getIndex(): Promise<{ raw: string; entries: Array<{ topic: string; pages: string }> }> {
    const indexPage = provider.indexPage ?? DEFAULT_INDEX_PAGE;
    const regex = provider.indexLineRegex ?? DEFAULT_INDEX_LINE_REGEX;
    const result = await getPage(indexPage, "A");
    const entries: Array<{ topic: string; pages: string }> = [];
    const reuse = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
    for (const line of result.text.split("\n")) {
      for (const m of line.matchAll(reuse)) {
        entries.push({ topic: m[1]!.trim(), pages: m[2]! });
      }
    }
    return { raw: result.text, entries };
  }

  function listTopics(): TopicDescriptor[] {
    return topicDescriptors(provider.topics);
  }

  async function getTopic(topic: TopicKey): Promise<{ topic: TopicDescriptor; pages: PageResult[] }> {
    const desc = provider.topics[topic];
    if (!desc) throw new Error(`Unknown topic for ${provider.code}: ${topic}`);
    const all = await fetchAll();
    const out: PageResult[] = [];
    for (const p of desc.pages) {
      if (!all.data[p]) continue;
      try {
        out.push(await getPage(p));
      } catch {
        // skip pages that don't exist in current snapshot
      }
    }
    return { topic: { key: topic, label: desc.label, pages: desc.pages }, pages: out };
  }

  async function search(
    query: string,
    opts: { caseSensitive?: boolean } = {},
  ): Promise<SearchHit[]> {
    if (!query) return [];
    const all = await fetchAll();
    const cs = opts.caseSensitive === true;
    const needle = cs ? query : query.toLowerCase();
    const hits: SearchHit[] = [];
    for (const [page, block] of Object.entries(all.data)) {
      for (const [key, html] of Object.entries(block.text)) {
        const text = stripPre(html);
        const haystack = cs ? text : text.toLowerCase();
        const idx = haystack.indexOf(needle);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 60);
        const end = Math.min(text.length, idx + needle.length + 60);
        const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
        const subpage = key.slice(page.length);
        hits.push({ page, subpage, snippet });
      }
    }
    return hits;
  }

  return {
    provider,
    fetchAll,
    getPage,
    listPages,
    getIndex,
    listTopics,
    getTopic,
    search,
  };
}

export type { Provider, TopicKey, TopicTable } from "./providers/types.js";

export const internals = {
  ROOT_CACHE_DIR,
  DEFAULT_CACHE_TTL_MS,
  cacheDir,
  cacheFile,
};
