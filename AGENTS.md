# AGENTS.md — Teletext

Cross-agent instructions for the **teletext** project. This file follows the open [agents.md](https://agents.md) convention: any AI coding agent (Codex, Cursor, Aider, Cline, Continue, Windsurf, Claude Code, …) should read it for project context.

## What this is

A reader for teletext from public broadcasters (Czech `ČT`, Swedish `SVT`, …), shipped as three composable npm packages plus a Claude Code plugin shell:

| Package | What it does | When an agent should reach for it |
|---|---|---|
| `@honem/teletext-core` | Provider-agnostic library: HTTP fetcher, 60s cache, page/topic/search API. Zero runtime deps. | Building a programmatic integration in JS/TS. |
| `@honem/teletext-mcp` | Stdio MCP server exposing `list_providers`, `get_page`, `get_index`, `get_topic`, `search`, `refresh`. | **Default**. Any MCP-capable client. |
| `@honem/teletext-cli` | Shell CLI: `teletext --provider=<code> <cmd>`. | Agents that can run shell but have no MCP host. |

All public broadcaster APIs the project hits are unauthenticated; no env vars, no secrets, no rate-limit keys.

## How to invoke teletext from an agent

### Via MCP (preferred)

If your client supports MCP, install the server once:

```jsonc
// Claude Desktop / Cursor / Cline / Windsurf / Continue → mcpServers.teletext
{
  "mcpServers": {
    "teletext": { "command": "npx", "args": ["-y", "@honem/teletext-mcp"] }
  }
}
```

Then call the tools directly. Each tool takes a `provider` arg (`ct` for Czech Television, `svt` for SVT). All return plain text in the broadcaster's native language — translate downstream if needed.

| Tool | Args | Use when the user asks for… |
|---|---|---|
| `list_providers` | `filter?` | "what teletexts are available", "which Swedish broadcasters" |
| `get_page` | `provider`, `page` (3-digit), `subpage?` | a specific page number |
| `get_index` | `provider` | "what topics are on teletext today" |
| `get_topic` | `provider`, `topic` (`news`, `weather`, `sport`, `economy`, `tv_program`, `news_world`, `news_domestic`, `news_regional`, `interests`) | "today's news/weather/sport" |
| `search` | `provider`, `query` | "is X mentioned anywhere on teletext" |
| `refresh` | `provider` | only if the user explicitly asks for the very latest data |

### Via CLI (fallback)

If you can run shell but not MCP:

```bash
npx -y @honem/teletext-cli list                          # all broadcasters
npx -y @honem/teletext-cli --provider=ct 100             # ČT page 100
npx -y @honem/teletext-cli --provider=svt search Stockholm
npx -y @honem/teletext-cli --provider=ct topic weather
npx -y @honem/teletext-cli --provider=ct refresh
```

Run `npx -y @honem/teletext-cli help` for the full grammar.

## Constraints to respect

- **No history.** Teletext is a live ticker. The upstream APIs only expose the *current* snapshot. Questions like "what was on page 130 yesterday?" cannot be answered. Do not hallucinate historical readings.
- **One snapshot per 60s.** The cache is shared across tools and processes (`~/.cache/teletext/<code>/latest.json`). Calling `refresh` bypasses it; don't call it speculatively.
- **Bulk fetch.** Each refresh pulls *all* pages for a broadcaster in a single HTTP request. Cheap to call many tools in sequence after the first one warms the cache.
- **Output is in the broadcaster's language** (Czech, Swedish, …). Summarize/translate as part of your response if the user's language differs.

## Repository layout (for code-modifying agents)

```
ct-teletext-plugin/                  # Nx workspace, npm workspaces
├── packages/
│   ├── core/          # @honem/teletext-core — lib + providers
│   ├── mcp/           # @honem/teletext-mcp  — bin: teletext-mcp
│   └── cli/           # @honem/teletext-cli  — bin: teletext
├── plugin/            # Claude Code plugin shell (bundles the above into self-contained dist/)
├── scripts/
│   └── bundle-plugin.mjs   # esbuild-based plugin/dist/ producer
├── tsconfig.base.json
├── tsconfig.json      # solution-style references the three packages
└── nx.json
```

Build everything with `npm run build` (runs `tsc -b` then bundles the plugin). Type-check only with `npm run typecheck`.

## Adding a new broadcaster

1. Create `packages/core/src/providers/<code>.ts` exporting a `Provider` (see `packages/core/src/providers/types.ts` for the full shape, and `ct.ts` / `svt.ts` for working examples).
2. If the broadcaster's endpoint shape differs from ČT's `{ data: { "100": {...} } }` bulk JSON, supply `fetchSnapshot(provider)` returning a normalized `TeletextData`. SVT's `fetchSvtSnapshot` shows how to adapt a third-party aggregator.
3. Register in `packages/core/src/providers/index.ts`.
4. Add a `plugin/commands/<code>.md` (Claude Code surface) — copy `ct.md`, swap two `ct` instances and the description.
5. `npm run build`. The MCP tool descriptions auto-update from `listProviders()`; no schema edits needed.

## What this project is not

- Not a teletext **archive** — only the current snapshot.
- Not a teletext **decoder** — relies on broadcasters' or aggregators' web JSON APIs.
- Not Claude-specific — the Claude Code plugin shell is one of several distribution surfaces; the underlying packages are vendor-neutral.
