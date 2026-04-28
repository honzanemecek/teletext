import { DEFAULT_USER_AGENT } from "../lib.js";
import type { PageBlock, Provider, TeletextData, TopicTable } from "./types.js";

const TOPICS: TopicTable = {
  news:          { label: "Nyheter (news headlines)",       pages: ["100", "101", "102", "103", "104", "105", "106", "107", "108", "109"] },
  news_domestic: { label: "Inrikes (domestic news)",        pages: ["101", "102", "103"] },
  news_world:    { label: "Utrikes (world news)",           pages: ["104", "105", "106", "107", "108", "109", "110", "111", "112"] },
  weather:       { label: "Vädret (weather)",               pages: ["400", "401", "402", "403", "404", "405", "415"] },
  sport:         { label: "Sport",                          pages: ["300", "301", "302", "303", "304", "305", "306", "307", "308", "330"] },
  tv_program:    { label: "På TV (TV listings)",            pages: ["600", "601", "602", "603", "623"] },
  interests:     { label: "Blandat (miscellaneous)",        pages: ["500"] },
};

interface RawEntry {
  num: string | number;
  title?: string;
  content?: string[];
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<span class="line[^"]*">/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(String(n), 10)))
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function fetchSvtSnapshot(provider: Provider): Promise<TeletextData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), provider.fetchTimeoutMs ?? 30_000);
  try {
    const res = await fetch(provider.apiUrl, {
      headers: {
        "User-Agent": provider.userAgent ?? DEFAULT_USER_AGENT,
        Accept: "application/json,*/*",
        "Accept-Language": provider.acceptLanguage ?? "sv,en;q=0.9",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`SVT Text API returned HTTP ${res.status}`);
    const raw = await res.text();
    // The texttv.nu endpoint occasionally prepends a PHP deprecation/notice block
    // before the JSON array; trim everything before the first `[{`.
    const idx = raw.indexOf("[{");
    if (idx === -1) throw new Error("SVT Text API returned no JSON array");
    const json = JSON.parse(raw.slice(idx)) as RawEntry[];

    const data: Record<string, PageBlock> = {};
    for (const e of json) {
      if (!e?.num || !e.content || !e.content.length) continue;
      const num = String(e.num);
      const plain = htmlToPlainText(e.content[0]!);
      if (!plain) continue;
      // Drop "page not in transmission" placeholders so the snapshot only contains live pages.
      if (/Sidan ej i s[äa]ndning/i.test(plain)) continue;
      data[num] = { subpages: ["A"], text: { [`${num}A`]: plain } };
    }
    return { data, timestamp: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}

export const svt: Provider = {
  code: "svt",
  label: "SVT Text",
  broadcaster: "Sveriges Television",
  country: "SE",
  countryName: "Sweden",
  language: "sv",
  description:
    "Swedish public-broadcaster teletext from Sveriges Television (SVT Text). " +
    "Bulk JSON via the third-party texttv.nu API (pages 100–899 in one request). " +
    "40-column fixed-width text in Swedish; master index at page 700.",
  apiUrl: "https://api.texttv.nu/api/get/100-899",
  topics: TOPICS,
  indexPage: "700",
  acceptLanguage: "sv,en;q=0.9",
  fetchTimeoutMs: 30_000,
  fetchSnapshot: fetchSvtSnapshot,
};
