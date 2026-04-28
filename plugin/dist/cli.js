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

// packages/cli/src/cli.ts
var RULE = "\u2500".repeat(40);
function header(title) {
  return `${RULE}
${title}
${RULE}`;
}
function formatPage(label, p) {
  const subInfo = p.availableSubpages.length > 1 ? ` (subpage ${p.subpage} of ${p.availableSubpages.join("")})` : "";
  return `${header(`${label} \u2014 page ${p.page}${subInfo}`)}
${p.text}`;
}
function parsePageArg(arg) {
  const m = arg.match(/^(\d{3})(?:[-]?([A-Za-z]|\d+))?$/);
  if (!m) throw new Error(`Invalid page: "${arg}". Expected 3 digits, optionally with subpage (e.g. 170, 170-2, 170B).`);
  return { page: m[1], subpage: m[2] };
}
function helpText(api, codes) {
  const topicKeys = api ? api.listTopics().map((t) => t.key).join(", ") : "(provider-dependent)";
  const providerHint = codes.length > 1 ? `
Provider:
  --provider=<code>      Required. Known: ${codes.join(", ")}.` : api ? `
Provider: ${api.provider.code} (${api.provider.broadcaster}) \u2014 single registered provider.` : "";
  const example = api?.provider.code ?? codes[0] ?? "<code>";
  return `Usage: teletext [--provider=<code>] [command] [args]

Commands:
  <page>[-sub|letter]    Show a teletext page (e.g. 100, 170-2, 200B). Default: 100.
  page <page>[-sub]      Same as above, explicit form.
  index                  Show the master index (page 100), parsed.
  search <query>         Search all pages for a substring.
  topic <name>           Show all pages for a topic. Names: ${topicKeys}.
  topics                 List supported topics.
  refresh                Force-refresh the local cache.
  list [filter]          List all registered broadcasters; optional filter by country/language/code.
  help                   Show this help.
${providerHint}

Examples:
  teletext --provider=${example}              # master index
  teletext --provider=${example} 170          # page 170, subpage A
  teletext --provider=${example} 170-2        # page 170, subpage B
  teletext --provider=${example} search po\u010Das\xED
  teletext --provider=${example} topic news_world
  teletext list                       # list all broadcasters
  teletext list cz                    # filter by country/language/code
`;
}
function pickProvider(argv) {
  const codes = listProviders().map((p) => p.code);
  let providerArg;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--provider=")) {
      providerArg = a.slice("--provider=".length);
    } else if (a === "--provider" || a === "-p") {
      providerArg = argv[i + 1];
      i += 1;
    } else {
      rest.push(a);
    }
  }
  if (!providerArg) {
    if (codes.length === 1) {
      return { provider: getProvider(codes[0]), rest };
    }
    process.stderr.write(
      `teletext: --provider=<code> required. Known: ${codes.join(", ")}.
`
    );
    process.exit(2);
  }
  const provider = getProvider(providerArg);
  if (!provider) {
    process.stderr.write(
      `teletext: unknown provider "${providerArg}". Known: ${codes.join(", ")}.
`
    );
    process.exit(2);
  }
  return { provider, rest };
}
async function cmdPage(api, arg) {
  const { page, subpage } = parsePageArg(arg ?? "100");
  const result = await api.getPage(page, subpage);
  process.stdout.write(formatPage(api.provider.label, result) + "\n");
}
async function cmdIndex(api) {
  const { raw, entries } = await api.getIndex();
  const indexPage = api.provider.indexPage ?? "100";
  process.stdout.write(header(`${api.provider.label} \u2014 page ${indexPage} (master index)`) + "\n");
  process.stdout.write(raw + "\n");
  if (entries.length) {
    process.stdout.write("\nParsed entries:\n");
    for (const e of entries) {
      process.stdout.write(`  ${e.topic.padEnd(28, " ")} ${e.pages}
`);
    }
  }
}
async function cmdSearch(api, query) {
  if (!query) {
    process.stderr.write("teletext search: missing query\n");
    process.exit(2);
  }
  const hits = await api.search(query);
  if (!hits.length) {
    process.stdout.write(`No matches for "${query}".
`);
    return;
  }
  process.stdout.write(header(`${api.provider.label} \u2014 search: "${query}" (${hits.length} hits)`) + "\n");
  for (const h of hits) {
    const sub = h.subpage ? `-${h.subpage}` : "";
    process.stdout.write(`  ${h.page}${sub}  ${h.snippet}
`);
  }
}
async function cmdTopic(api, name) {
  if (!name) {
    process.stderr.write("teletext topic: missing topic name. See 'teletext topics'.\n");
    process.exit(2);
  }
  const known = api.listTopics().map((t) => t.key);
  if (!known.includes(name)) {
    process.stderr.write(`teletext topic: unknown topic "${name}". Known for ${api.provider.code}: ${known.join(", ")}.
`);
    process.exit(2);
  }
  const { topic, pages } = await api.getTopic(name);
  process.stdout.write(header(`${api.provider.label} \u2014 topic: ${topic.label}`) + "\n");
  if (!pages.length) {
    process.stdout.write("(No pages from this topic are present in the current snapshot.)\n");
    return;
  }
  for (const p of pages) {
    process.stdout.write(`
${formatPage(api.provider.label, p)}
`);
  }
}
function cmdTopics(api) {
  process.stdout.write(header(`${api.provider.label} \u2014 topics`) + "\n");
  for (const t of api.listTopics()) {
    process.stdout.write(`  ${t.key.padEnd(16, " ")} ${t.label}
      pages: ${t.pages.join(", ")}
`);
  }
}
async function cmdRefresh(api) {
  const data = await api.fetchAll({ force: true });
  const count = Object.keys(data.data).length;
  process.stdout.write(`Refreshed cache for ${api.provider.code}. ${count} pages cached.
`);
}
function cmdList(filter) {
  const matches = findProviders(filter);
  if (!matches.length) {
    if (filter) {
      const all = listProviders().map((p) => p.code).join(", ");
      process.stdout.write(`No broadcasters match "${filter}". Registered: ${all}.
`);
    } else {
      process.stdout.write("No broadcasters registered.\n");
    }
    return;
  }
  const title = filter ? `Teletext broadcasters matching "${filter}" (${matches.length})` : `Teletext broadcasters (${matches.length})`;
  process.stdout.write(header(title) + "\n");
  for (const p of matches) {
    process.stdout.write(
      `  /teletext:${p.code.padEnd(8, " ")} ${p.broadcaster} \u2014 ${p.countryName} (${p.country}, lang ${p.language})
      ${p.description}
`
    );
  }
  process.stdout.write("\nFilter examples: `teletext list cz`, `teletext list de`, `teletext list ct`.\n");
}
async function main() {
  const argv = process.argv.slice(2);
  const codes = listProviders().map((p) => p.code);
  const standalone = argv[0];
  if (standalone === "list") {
    return cmdList(argv[1]);
  }
  const wantsHelp = argv.length === 0 || ["help", "--help", "-h"].includes(standalone ?? "");
  if (wantsHelp && codes.length > 1 && !argv.some((a) => a.startsWith("--provider") || a === "-p")) {
    process.stdout.write(helpText(null, codes));
    return;
  }
  const { provider, rest } = pickProvider(argv);
  const api = makeProviderApi(provider);
  const cmd = rest[0];
  try {
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      process.stdout.write(helpText(api, codes));
      return;
    }
    if (cmd === "index") return cmdIndex(api);
    if (cmd === "search") return cmdSearch(api, rest.slice(1).join(" "));
    if (cmd === "topic") return cmdTopic(api, rest[1]);
    if (cmd === "topics") return cmdTopics(api);
    if (cmd === "refresh") return cmdRefresh(api);
    if (cmd === "page") return cmdPage(api, rest[1]);
    if (/^\d{3}/.test(cmd)) return cmdPage(api, cmd);
    process.stderr.write(`teletext: unknown command "${cmd}"

${helpText(api, codes)}`);
    process.exit(2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`teletext: ${msg}
`);
    process.exit(1);
  }
}
void main();
