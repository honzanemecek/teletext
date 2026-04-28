#!/usr/bin/env node

// packages/core/dist/lib.js
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
var ROOT_CACHE_DIR = join(homedir(), ".cache", "teletext");
var DEFAULT_CACHE_TTL_MS = 6e4;
var DEFAULT_FETCH_TIMEOUT_MS = 15e3;
var DEFAULT_INDEX_PAGE = "100";
var DEFAULT_INDEX_LINE_REGEX = /([\p{L}*][\p{L}* ]+?)\.{2,}\s*(\d{3}(?:[-,]\d{1,3})*)/gu;
var DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var memoryCache = /* @__PURE__ */ new Map();
function cacheDir(code) {
  return join(ROOT_CACHE_DIR, code);
}
function cacheFile(code) {
  return join(cacheDir(code), "latest.json");
}
async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}
async function readCacheFile(code) {
  try {
    const raw = await readFile(cacheFile(code), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeCacheFile(code, env) {
  const file = cacheFile(code);
  await ensureDir(dirname(file));
  await writeFile(file, JSON.stringify(env), "utf8");
}
async function fetchFromNetwork(provider) {
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
        "Accept-Language": provider.acceptLanguage ?? "en"
      },
      signal: ctrl.signal
    });
    if (!res.ok) {
      throw new Error(`Teletext API returned HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json || typeof json !== "object" || !json.data) {
      throw new Error("Teletext API returned unexpected payload shape");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
function stripPre(html) {
  return html.replace(/^<pre>/i, "").replace(/<\/pre>\s*$/i, "");
}
function normalizeSubpage(raw, available) {
  if (!available.length)
    return "";
  if (!raw)
    return available[0];
  const upper = raw.trim().toUpperCase();
  if (/^[A-Z]$/.test(upper) && available.includes(upper))
    return upper;
  if (/^\d+$/.test(upper)) {
    const idx = parseInt(upper, 10) - 1;
    if (idx >= 0 && idx < available.length)
      return available[idx];
  }
  return available[0];
}
function topicDescriptors(topics) {
  return Object.keys(topics).filter((k) => topics[k] !== void 0).map((k) => {
    const entry = topics[k];
    return { key: k, label: entry.label, pages: entry.pages };
  });
}
function makeProviderApi(provider) {
  const ttl = provider.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  async function fetchAll(opts = {}) {
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
    const env = { fetchedAt: now, payload };
    memoryCache.set(provider.code, env);
    try {
      await writeCacheFile(provider.code, env);
    } catch {
    }
    return payload;
  }
  async function getPage(page, subpage) {
    const all = await fetchAll();
    const block = all.data[page];
    if (!block) {
      const available = Object.keys(all.data).sort();
      throw new Error(`Page ${page} not found. Try one of: ${available.slice(0, 8).join(", ")}\u2026`);
    }
    const subs = block.subpages.length ? block.subpages : Object.keys(block.text);
    const chosen = normalizeSubpage(subpage, subs);
    const key = chosen ? `${page}${chosen}` : page;
    const html = block.text[key] ?? Object.values(block.text)[0] ?? "";
    return {
      page,
      subpage: chosen,
      availableSubpages: subs,
      text: stripPre(html)
    };
  }
  async function listPages() {
    const all = await fetchAll();
    return Object.keys(all.data).sort().map((p) => ({ page: p, subpages: all.data[p].subpages }));
  }
  async function getIndex() {
    const indexPage = provider.indexPage ?? DEFAULT_INDEX_PAGE;
    const regex = provider.indexLineRegex ?? DEFAULT_INDEX_LINE_REGEX;
    const result = await getPage(indexPage, "A");
    const entries = [];
    const reuse = regex.global ? regex : new RegExp(regex.source, regex.flags + "g");
    for (const line of result.text.split("\n")) {
      for (const m of line.matchAll(reuse)) {
        entries.push({ topic: m[1].trim(), pages: m[2] });
      }
    }
    return { raw: result.text, entries };
  }
  function listTopics() {
    return topicDescriptors(provider.topics);
  }
  async function getTopic(topic) {
    const desc = provider.topics[topic];
    if (!desc)
      throw new Error(`Unknown topic for ${provider.code}: ${topic}`);
    const all = await fetchAll();
    const out = [];
    for (const p of desc.pages) {
      if (!all.data[p])
        continue;
      try {
        out.push(await getPage(p));
      } catch {
      }
    }
    return { topic: { key: topic, label: desc.label, pages: desc.pages }, pages: out };
  }
  async function search(query, opts = {}) {
    if (!query)
      return [];
    const all = await fetchAll();
    const cs = opts.caseSensitive === true;
    const needle = cs ? query : query.toLowerCase();
    const hits = [];
    for (const [page, block] of Object.entries(all.data)) {
      for (const [key, html] of Object.entries(block.text)) {
        const text = stripPre(html);
        const haystack = cs ? text : text.toLowerCase();
        const idx = haystack.indexOf(needle);
        if (idx === -1)
          continue;
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
    search
  };
}

// packages/core/dist/providers/types.js
function summarize(p) {
  return {
    code: p.code,
    label: p.label,
    broadcaster: p.broadcaster,
    country: p.country,
    countryName: p.countryName,
    language: p.language,
    description: p.description
  };
}

// packages/core/dist/providers/ct.js
var TOPICS = {
  news: { label: "Zpr\xE1vy (news headlines)", pages: ["101", "110", "111", "112", "113", "130", "131", "132"] },
  news_domestic: { label: "Z domova (domestic news)", pages: ["110", "111", "112", "113", "114", "115"] },
  news_world: { label: "Ze sv\u011Bta (world news)", pages: ["130", "131", "132", "133", "134", "135"] },
  news_regional: { label: "Z region\u016F (regional news)", pages: ["150", "151", "152", "153"] },
  weather: { label: "Po\u010Das\xED (weather)", pages: ["170", "171", "172", "173", "174", "178", "179", "180"] },
  sport: { label: "Sport", pages: ["200", "201", "202", "203", "204", "240", "250", "280", "290", "400"] },
  economy: { label: "Finance / ekonomika", pages: ["500", "501", "502", "510", "520"] },
  tv_program: { label: "TV program", pages: ["300", "301", "302", "303", "310", "320"] },
  interests: { label: "Z\xE1jmy / zaj\xEDmavosti", pages: ["600", "601", "610", "620", "160"] }
};
var ct = {
  code: "ct",
  label: "\u010CT Teletext",
  broadcaster: "\u010Cesk\xE1 televize",
  country: "CZ",
  countryName: "Czechia",
  language: "cs",
  description: "Public-broadcaster teletext from Czech Television (\u010Cesk\xE1 televize). Bulk JSON feed (~1 MB, all pages); 40-column fixed-width text in Czech.",
  apiUrl: "https://api-teletext.ceskatelevize.cz/pages/text",
  topics: TOPICS,
  acceptLanguage: "cs,en;q=0.9"
};

// packages/core/dist/providers/svt.js
var TOPICS2 = {
  news: { label: "Nyheter (news headlines)", pages: ["100", "101", "102", "103", "104", "105", "106", "107", "108", "109"] },
  news_domestic: { label: "Inrikes (domestic news)", pages: ["101", "102", "103"] },
  news_world: { label: "Utrikes (world news)", pages: ["104", "105", "106", "107", "108", "109", "110", "111", "112"] },
  weather: { label: "V\xE4dret (weather)", pages: ["400", "401", "402", "403", "404", "405", "415"] },
  sport: { label: "Sport", pages: ["300", "301", "302", "303", "304", "305", "306", "307", "308", "330"] },
  tv_program: { label: "P\xE5 TV (TV listings)", pages: ["600", "601", "602", "603", "623"] },
  interests: { label: "Blandat (miscellaneous)", pages: ["500"] }
};
function htmlToPlainText(html) {
  return html.replace(/<span class="line[^"]*">/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(String(n), 10))).replace(/\n{2,}/g, "\n").trim();
}
async function fetchSvtSnapshot(provider) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), provider.fetchTimeoutMs ?? 3e4);
  try {
    const res = await fetch(provider.apiUrl, {
      headers: {
        "User-Agent": provider.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "application/json,*/*",
        "Accept-Language": provider.acceptLanguage ?? "sv,en;q=0.9"
      },
      signal: ctrl.signal
    });
    if (!res.ok)
      throw new Error(`SVT Text API returned HTTP ${res.status}`);
    const raw = await res.text();
    const idx = raw.indexOf("[{");
    if (idx === -1)
      throw new Error("SVT Text API returned no JSON array");
    const json = JSON.parse(raw.slice(idx));
    const data = {};
    for (const e of json) {
      if (!e?.num || !e.content || !e.content.length)
        continue;
      const num = String(e.num);
      const plain = htmlToPlainText(e.content[0]);
      if (!plain)
        continue;
      if (/Sidan ej i s[äa]ndning/i.test(plain))
        continue;
      data[num] = { subpages: ["A"], text: { [`${num}A`]: plain } };
    }
    return { data, timestamp: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}
var svt = {
  code: "svt",
  label: "SVT Text",
  broadcaster: "Sveriges Television",
  country: "SE",
  countryName: "Sweden",
  language: "sv",
  description: "Swedish public-broadcaster teletext from Sveriges Television (SVT Text). Bulk JSON via the third-party texttv.nu API (pages 100\u2013899 in one request). 40-column fixed-width text in Swedish; master index at page 700.",
  apiUrl: "https://api.texttv.nu/api/get/100-899",
  topics: TOPICS2,
  indexPage: "700",
  acceptLanguage: "sv,en;q=0.9",
  fetchTimeoutMs: 3e4,
  fetchSnapshot: fetchSvtSnapshot
};

// packages/core/dist/providers/index.js
var PROVIDERS = {
  [ct.code]: ct,
  [svt.code]: svt
};
function getProvider(code) {
  return PROVIDERS[code];
}
function listProviders() {
  return Object.values(PROVIDERS);
}
function findProviders(term) {
  if (!term)
    return listProviders();
  const t = term.trim().toLowerCase();
  if (!t)
    return listProviders();
  return listProviders().filter((p) => {
    const exact = [p.code, p.country, p.language].map((s) => s.toLowerCase());
    if (exact.includes(t))
      return true;
    if (t.length < 3)
      return false;
    const haystacks = [p.broadcaster, p.countryName, p.label].map((s) => s.toLowerCase());
    return haystacks.some((s) => s.includes(t));
  });
}
function summarizeAll() {
  return listProviders().map(summarize);
}

// packages/mcp/src/server.ts
var PROTOCOL_VERSION = "2024-11-05";
var SERVER_NAME = "teletext";
var SERVER_VERSION = "0.5.0";
var PROVIDERS2 = listProviders();
var CODES = PROVIDERS2.map((p) => p.code);
var PROVIDER_REQUIRED = CODES.length > 1;
var PROVIDER_LABELS = PROVIDERS2.map((p) => `${p.code} (${p.broadcaster}, ${p.countryName})`).join("; ");
var TOPIC_UNION = Array.from(
  new Set(PROVIDERS2.flatMap((p) => Object.keys(p.topics)))
);
var PROVIDER_PROP = {
  type: "string",
  enum: CODES,
  description: `Broadcaster code. ` + (PROVIDER_REQUIRED ? `Required. Available: ${PROVIDER_LABELS}.` : `Optional \u2014 defaults to ${CODES[0]} (${PROVIDERS2[0].broadcaster}). Available: ${PROVIDER_LABELS}.`)
};
function withProvider(props, required) {
  return {
    type: "object",
    properties: { provider: PROVIDER_PROP, ...props },
    required: PROVIDER_REQUIRED ? ["provider", ...required] : required
  };
}
function pickProviderApi(args) {
  let code = args.provider;
  if (!code) {
    if (PROVIDER_REQUIRED) {
      throw new Error(
        `'provider' argument is required when multiple broadcasters are registered. Available: ${CODES.join(", ")}.`
      );
    }
    code = CODES[0];
  }
  const provider = getProvider(code);
  if (!provider) {
    throw new Error(`Unknown provider "${code}". Known: ${CODES.join(", ")}.`);
  }
  return makeProviderApi(provider);
}
var TOOLS = [
  {
    name: "list_providers",
    description: "List every registered teletext broadcaster with metadata (broadcaster name, country, language, short description). Optionally filter by a free-form term that matches the broadcaster code, country (ISO-3166 alpha-2 or full name), language (ISO-639-1), or broadcaster name. Use this whenever the user asks 'what teletexts are available', 'which Swedish/German/Czech teletexts do we have', or similar.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional case-insensitive filter. Matches against code/country/countryName/language/broadcaster/label. Examples: 'cz', 'czechia', 'cs', 'ct', 'de', 'germany'."
        }
      }
    },
    handler: async (args) => {
      const filter = args.filter ? String(args.filter) : void 0;
      const matches = findProviders(filter);
      const all = summarizeAll();
      if (!matches.length) {
        const known = all.map((p) => `${p.code}/${p.country}/${p.language}`).join(", ");
        return filter ? `No broadcasters match "${filter}". Registered: ${known || "(none)"}.` : "No broadcasters registered.";
      }
      const lines = matches.map(
        (p) => `- code=${p.code}  broadcaster="${p.broadcaster}"  country=${p.country} (${p.countryName})  language=${p.language}
  slash=/teletext:${p.code}
  ${p.description}`
      );
      const header = filter ? `Teletext broadcasters matching "${filter}" (${matches.length} of ${all.length}):` : `Teletext broadcasters (${matches.length}):`;
      return `${header}
${lines.join("\n")}`;
    }
  },
  {
    name: "get_page",
    description: "Fetch a single teletext page by its 3-digit number from a specific broadcaster. Optionally specify a subpage by letter (A, B, \u2026). Returns the page's plain text exactly as broadcast (40-column fixed-width, in the broadcaster's language). Note: teletext is current-state only \u2014 no historical data is available.",
    inputSchema: withProvider(
      {
        page: {
          type: "string",
          description: '3-digit page number, e.g. "100", "170", "200".',
          pattern: "^\\d{3}$"
        },
        subpage: {
          type: "string",
          description: "Optional subpage letter (A, B, C, \u2026). Defaults to A.",
          pattern: "^[A-Za-z]$"
        }
      },
      ["page"]
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const page = String(args.page ?? "");
      const subpage = args.subpage ? String(args.subpage) : void 0;
      const r = await api.getPage(page, subpage);
      const subInfo = r.availableSubpages.length > 1 ? ` (subpage ${r.subpage} of ${r.availableSubpages.join("")})` : "";
      return `${api.provider.label} page ${r.page}${subInfo}:
${r.text}`;
    }
  },
  {
    name: "get_index",
    description: "Return the master index page parsed into topic\u2192page-number entries for one broadcaster. Use this to discover which pages cover which topics on today's teletext.",
    inputSchema: withProvider({}, []),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const { entries } = await api.getIndex();
      if (!entries.length) {
        return `No index entries parsed from ${api.provider.label} master index.`;
      }
      const lines = entries.map((e) => `${e.topic.padEnd(28, " ")} ${e.pages}`);
      return `${api.provider.label} index (parsed from master index):
${lines.join("\n")}`;
    }
  },
  {
    name: "get_topic",
    description: "Fetch all teletext pages for a semantic topic (news, sport, weather, finance, etc.) from one broadcaster. Use this when the user asks for 'today's news', 'the weather forecast', 'sport results' and so on. Returns concatenated page texts. Note: teletext shows the CURRENT snapshot only \u2014 no history. Topic availability varies by broadcaster.",
    inputSchema: withProvider(
      {
        topic: {
          type: "string",
          enum: TOPIC_UNION,
          description: `One of: ${TOPIC_UNION.join(", ")}. Not every topic exists for every broadcaster.`
        }
      },
      ["topic"]
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const topic = String(args.topic ?? "");
      const { topic: desc, pages } = await api.getTopic(topic);
      if (!pages.length) {
        return `Topic "${desc.label}" (${api.provider.code}): no pages from this topic are present in the current snapshot.`;
      }
      const blocks = pages.map((p) => `--- page ${p.page}${p.subpage ? p.subpage : ""} ---
${p.text}`);
      return `${api.provider.label} \u2014 topic: ${desc.label}

${blocks.join("\n\n")}`;
    }
  },
  {
    name: "search",
    description: "Search across every teletext page for a substring (case-insensitive) within one broadcaster's snapshot. Returns a list of pages that contain the query, with short snippets. Useful for ad-hoc lookups when no semantic topic fits.",
    inputSchema: withProvider(
      {
        query: { type: "string", description: "Substring to search for.", minLength: 1 }
      },
      ["query"]
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const q = String(args.query ?? "");
      const hits = await api.search(q);
      if (!hits.length) return `${api.provider.label}: no matches for "${q}".`;
      const lines = hits.map((h) => `  ${h.page}${h.subpage ? `-${h.subpage}` : ""}  ${h.snippet}`);
      return `${api.provider.label} search "${q}" \u2014 ${hits.length} hit(s):
${lines.join("\n")}`;
    }
  },
  {
    name: "refresh",
    description: "Force a re-fetch of one broadcaster's teletext data, bypassing the 60-second cache. Use this only if the user explicitly asks for the very latest data.",
    inputSchema: withProvider({}, []),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const data = await api.fetchAll({ force: true });
      const n = Object.keys(data.data).length;
      return `Refreshed ${api.provider.label} cache: ${n} pages.`;
    }
  }
];
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function makeError(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}
function makeResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
async function handleRequest(req) {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize": {
      return makeResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
    }
    case "notifications/initialized":
    case "initialized":
      return null;
    case "tools/list": {
      return makeResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      });
    }
    case "tools/call": {
      const params = req.params ?? {};
      const name = params.name;
      const args = params.arguments ?? {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return makeError(id, -32601, `Unknown tool: ${name}`);
      try {
        const text = await tool.handler(args);
        return makeResult(id, { content: [{ type: "text", text }] });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return makeResult(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true
        });
      }
    }
    case "ping":
      return makeResult(id, {});
    default:
      if (req.id === void 0 || req.id === null) return null;
      return makeError(id, -32601, `Method not found: ${req.method}`);
  }
}
var buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      send(makeError(null, -32700, "Parse error"));
      continue;
    }
    void (async () => {
      const resp = await handleRequest(req);
      if (resp !== null) send(resp);
    })();
  }
});
process.stdin.on("end", () => {
  process.exit(0);
});
