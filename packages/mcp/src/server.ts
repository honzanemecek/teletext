#!/usr/bin/env node
// Minimal MCP stdio server, zero external deps.
// Implements the JSON-RPC 2.0 framing and the small slice of the MCP protocol
// we need to expose tools (initialize, tools/list, tools/call).

import {
  makeProviderApi,
  type ProviderApi,
  findProviders,
  getProvider,
  listProviders,
  summarizeAll,
  type TopicKey,
} from "@honem/teletext-core";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "teletext";
const SERVER_VERSION = "0.5.0";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

const PROVIDERS = listProviders();
const CODES = PROVIDERS.map((p) => p.code);
const PROVIDER_REQUIRED = CODES.length > 1;
const PROVIDER_LABELS = PROVIDERS.map((p) => `${p.code} (${p.broadcaster}, ${p.countryName})`).join("; ");

const TOPIC_UNION = Array.from(
  new Set(PROVIDERS.flatMap((p) => Object.keys(p.topics))),
) as TopicKey[];

const PROVIDER_PROP = {
  type: "string",
  enum: CODES,
  description:
    `Broadcaster code. ` +
    (PROVIDER_REQUIRED
      ? `Required. Available: ${PROVIDER_LABELS}.`
      : `Optional — defaults to ${CODES[0]} (${PROVIDERS[0]!.broadcaster}). Available: ${PROVIDER_LABELS}.`),
};

function withProvider(props: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return {
    type: "object",
    properties: { provider: PROVIDER_PROP, ...props },
    required: PROVIDER_REQUIRED ? ["provider", ...required] : required,
  };
}

function pickProviderApi(args: Record<string, unknown>): ProviderApi {
  let code = args.provider as string | undefined;
  if (!code) {
    if (PROVIDER_REQUIRED) {
      throw new Error(
        `'provider' argument is required when multiple broadcasters are registered. Available: ${CODES.join(", ")}.`,
      );
    }
    code = CODES[0]!;
  }
  const provider = getProvider(code);
  if (!provider) {
    throw new Error(`Unknown provider "${code}". Known: ${CODES.join(", ")}.`);
  }
  return makeProviderApi(provider);
}

const TOOLS: ToolDef[] = [
  {
    name: "list_providers",
    description:
      "List every registered teletext broadcaster with metadata (broadcaster name, country, language, short description). " +
      "Optionally filter by a free-form term that matches the broadcaster code, country (ISO-3166 alpha-2 or full name), " +
      "language (ISO-639-1), or broadcaster name. " +
      "Use this whenever the user asks 'what teletexts are available', 'which Swedish/German/Czech teletexts do we have', or similar.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description:
            "Optional case-insensitive filter. Matches against code/country/countryName/language/broadcaster/label. " +
            "Examples: 'cz', 'czechia', 'cs', 'ct', 'de', 'germany'.",
        },
      },
    },
    handler: async (args) => {
      const filter = args.filter ? String(args.filter) : undefined;
      const matches = findProviders(filter);
      const all = summarizeAll();
      if (!matches.length) {
        const known = all.map((p) => `${p.code}/${p.country}/${p.language}`).join(", ");
        return filter
          ? `No broadcasters match "${filter}". Registered: ${known || "(none)"}.`
          : "No broadcasters registered.";
      }
      const lines = matches.map(
        (p) =>
          `- code=${p.code}  broadcaster="${p.broadcaster}"  country=${p.country} (${p.countryName})  language=${p.language}\n  slash=/teletext:${p.code}\n  ${p.description}`,
      );
      const header = filter
        ? `Teletext broadcasters matching "${filter}" (${matches.length} of ${all.length}):`
        : `Teletext broadcasters (${matches.length}):`;
      return `${header}\n${lines.join("\n")}`;
    },
  },
  {
    name: "get_page",
    description:
      "Fetch a single teletext page by its 3-digit number from a specific broadcaster. " +
      "Optionally specify a subpage by letter (A, B, …). Returns the page's plain text exactly as broadcast " +
      "(40-column fixed-width, in the broadcaster's language). " +
      "Note: teletext is current-state only — no historical data is available.",
    inputSchema: withProvider(
      {
        page: {
          type: "string",
          description: "3-digit page number, e.g. \"100\", \"170\", \"200\".",
          pattern: "^\\d{3}$",
        },
        subpage: {
          type: "string",
          description: "Optional subpage letter (A, B, C, …). Defaults to A.",
          pattern: "^[A-Za-z]$",
        },
      },
      ["page"],
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const page = String(args.page ?? "");
      const subpage = args.subpage ? String(args.subpage) : undefined;
      const r = await api.getPage(page, subpage);
      const subInfo = r.availableSubpages.length > 1 ? ` (subpage ${r.subpage} of ${r.availableSubpages.join("")})` : "";
      return `${api.provider.label} page ${r.page}${subInfo}:\n${r.text}`;
    },
  },
  {
    name: "get_index",
    description:
      "Return the master index page parsed into topic→page-number entries for one broadcaster. " +
      "Use this to discover which pages cover which topics on today's teletext.",
    inputSchema: withProvider({}, []),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const { entries } = await api.getIndex();
      if (!entries.length) {
        return `No index entries parsed from ${api.provider.label} master index.`;
      }
      const lines = entries.map((e) => `${e.topic.padEnd(28, " ")} ${e.pages}`);
      return `${api.provider.label} index (parsed from master index):\n${lines.join("\n")}`;
    },
  },
  {
    name: "get_topic",
    description:
      "Fetch all teletext pages for a semantic topic (news, sport, weather, finance, etc.) from one broadcaster. " +
      "Use this when the user asks for 'today's news', 'the weather forecast', 'sport results' and so on. " +
      "Returns concatenated page texts. Note: teletext shows the CURRENT snapshot only — no history. " +
      "Topic availability varies by broadcaster.",
    inputSchema: withProvider(
      {
        topic: {
          type: "string",
          enum: TOPIC_UNION,
          description: `One of: ${TOPIC_UNION.join(", ")}. Not every topic exists for every broadcaster.`,
        },
      },
      ["topic"],
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const topic = String(args.topic ?? "") as TopicKey;
      const { topic: desc, pages } = await api.getTopic(topic);
      if (!pages.length) {
        return `Topic "${desc.label}" (${api.provider.code}): no pages from this topic are present in the current snapshot.`;
      }
      const blocks = pages.map((p) => `--- page ${p.page}${p.subpage ? p.subpage : ""} ---\n${p.text}`);
      return `${api.provider.label} — topic: ${desc.label}\n\n${blocks.join("\n\n")}`;
    },
  },
  {
    name: "search",
    description:
      "Search across every teletext page for a substring (case-insensitive) within one broadcaster's snapshot. " +
      "Returns a list of pages that contain the query, with short snippets. " +
      "Useful for ad-hoc lookups when no semantic topic fits.",
    inputSchema: withProvider(
      {
        query: { type: "string", description: "Substring to search for.", minLength: 1 },
      },
      ["query"],
    ),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const q = String(args.query ?? "");
      const hits = await api.search(q);
      if (!hits.length) return `${api.provider.label}: no matches for "${q}".`;
      const lines = hits.map((h) => `  ${h.page}${h.subpage ? `-${h.subpage}` : ""}  ${h.snippet}`);
      return `${api.provider.label} search "${q}" — ${hits.length} hit(s):\n${lines.join("\n")}`;
    },
  },
  {
    name: "refresh",
    description:
      "Force a re-fetch of one broadcaster's teletext data, bypassing the 60-second cache. " +
      "Use this only if the user explicitly asks for the very latest data.",
    inputSchema: withProvider({}, []),
    handler: async (args) => {
      const api = pickProviderApi(args);
      const data = await api.fetchAll({ force: true });
      const n = Object.keys(data.data).length;
      return `Refreshed ${api.provider.label} cache: ${n} pages.`;
    },
  },
];

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function makeError(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function makeResult(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

async function handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize": {
      return makeResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
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
          inputSchema: t.inputSchema,
        })),
      });
    }
    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
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
          isError: true,
        });
      }
    }
    case "ping":
      return makeResult(id, {});
    default:
      if (req.id === undefined || req.id === null) return null;
      return makeError(id, -32601, `Method not found: ${req.method}`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let nl: number;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line) as JsonRpcRequest;
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
