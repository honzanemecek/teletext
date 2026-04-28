# Teletext — for Claude Code, Claude Desktop, Cursor, VS Code, Continue, Goose, Windsurf, Codex CLI, …

Read **teletext from public broadcasters** from any AI agent. Ships as three composable npm packages plus a Claude Code plugin shell.

| Surface | What you get | For whom |
|---|---|---|
| `@honem/teletext-mcp` | Stdio MCP server (`teletext-mcp` binary) — provider-aware tools `list_providers`, `get_page`, `get_index`, `get_topic`, `search`, `refresh` | **Any MCP-capable client** — Claude Desktop, Cursor, VS Code Copilot Chat, Continue, Goose, Windsurf, Cline, Codex CLI, … |
| `@honem/teletext-cli` | Shell CLI (`teletext` binary) | Any agent or human that can run a shell command |
| `@honem/teletext-core` | Provider-agnostic library (HTTP fetcher, cache, page/topic/search API). Zero runtime deps. | TypeScript/JavaScript integrations |
| Claude Code plugin (`teletext@honem`) | Slash commands `/teletext:ct`, `/teletext:svt`, `/teletext:list` + bundled MCP server | Claude Code users — single install, offline-friendly |

Zero runtime dependencies. The packages compile to plain Node.js ESM; TypeScript is used at build time only.

## Currently registered broadcasters

| Code | Broadcaster | Country | Language | Slash | API |
|------|-------------|---------|----------|-------|-----|
| `ct` | Česká televize (ČT Teletext) | Czechia (CZ) | cs | `/teletext:ct` | `https://api-teletext.ceskatelevize.cz/pages/text` (bulk JSON) |
| `svt` | Sveriges Television (SVT Text) | Sweden (SE) | sv | `/teletext:svt` | `https://api.texttv.nu/api/get/100-899` (bulk JSON via texttv.nu, HTML→text) |

`/teletext:list` (or the `teletext_list_providers` MCP tool) prints these with full descriptions and supports filtering — e.g. `/teletext:list sweden`, `/teletext:list cz`, `/teletext:list svt`.

## What you can do

```text
/teletext:list                  # show all broadcasters
/teletext:list sweden           # filter by country/language/code

/teletext:ct                    # ČT master index (page 100)
/teletext:ct 170                # ČT weather, page A
/teletext:ct 170-2              # ČT weather, subpage B (also: /teletext:ct 170B)
/teletext:ct index              # parsed topic → page-number table
/teletext:ct search počasí      # full-text search across all pages
/teletext:ct topic sport        # all sport pages, concatenated
/teletext:ct topics             # list semantic topics
/teletext:ct refresh            # force-refresh cache

/teletext:svt 100               # SVT Text headlines
/teletext:svt index             # SVT master index (page 700)
/teletext:svt search Stockholm
/teletext:svt topic weather
```

In a chat with the MCP server enabled, you can simply ask:

- *"What teletexts are available?"* → calls `teletext_list_providers`.
- *"Show me Swedish weather from teletext."* → picks `provider=svt`, calls `teletext_get_topic` with `topic=weather`.
- *"Search Czech teletext for 'Babiš'."* → `provider=ct`, `teletext_search`.

Claude picks the right tool (and provider) and summarizes.

## Install

### Use from any MCP client

The MCP server is `@honem/teletext-mcp`. All clients converge on the same command — `npx -y @honem/teletext-mcp` — only the host's config-file shape differs.

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "teletext": {
      "command": "npx",
      "args": ["-y", "@honem/teletext-mcp"]
    }
  }
}
```

Restart Claude Desktop, then ask: *"List the teletext broadcasters."*

#### Cursor

Per-project: `.cursor/mcp.json`. Global: `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "teletext": {
      "command": "npx",
      "args": ["-y", "@honem/teletext-mcp"]
    }
  }
}
```

#### VS Code (Copilot Chat MCP)

Workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "teletext": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@honem/teletext-mcp"]
    }
  }
}
```

#### Continue

`~/.continue/config.json`:

```json
{
  "mcpServers": {
    "teletext": {
      "command": "npx",
      "args": ["-y", "@honem/teletext-mcp"]
    }
  }
}
```

#### Goose

`~/.config/goose/config.yaml`:

```yaml
extensions:
  teletext:
    type: stdio
    cmd: npx
    args: ["-y", "@honem/teletext-mcp"]
    enabled: true
```

#### Cline / Windsurf

Both follow the Cursor / Claude Desktop `mcpServers` shape. Drop the same snippet into the relevant config file (`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` for Cline; the Windsurf MCP settings panel for Windsurf).

#### OpenAI Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.teletext]
command = "npx"
args = ["-y", "@honem/teletext-mcp"]
```

### Use from any shell-capable agent

```sh
npx -y @honem/teletext-cli list                 # all broadcasters
npx -y @honem/teletext-cli --provider=ct 100    # ČT page 100
npx -y @honem/teletext-cli --provider=svt 100   # SVT page 100
npx -y @honem/teletext-cli --provider=ct help
```

### Use as a Claude Code plugin

The plugin bundles the MCP server + a CLI + slash commands — single install, offline-friendly (no `npx` cold-start latency, no network at startup).

```text
/plugin marketplace add honzanemecek/teletext
/plugin install teletext@honem
```

From a local clone (the repo is a single-marketplace, single-plugin layout):

```sh
git clone <this-repo> teletext
cd teletext
npm install && npm run build   # only needed if you cloned without plugin/dist/
```

```text
/plugin marketplace add /path/to/teletext
/plugin install teletext@honem
```

The `plugin/dist/` directory is committed so installation requires no build step.

## Adding a broadcaster

The core is provider-modular. To add a new broadcaster (no other edits required):

1. Create `packages/core/src/providers/<code>.ts` exporting a `Provider`. Required metadata: `code`, `label`, `broadcaster`, `country` (ISO 3166-1 alpha-2), `countryName`, `language` (ISO 639-1), `description`, `apiUrl`, `topics`. See `packages/core/src/providers/types.ts` for the full shape (User-Agent, language, cache TTL, index page, line regex, custom fetcher are all overridable).
2. If your broadcaster's endpoint shape differs from ČT's `{ data: { "100": {...} } }` bulk JSON, supply a `fetchSnapshot(provider)` that returns a normalized `TeletextData`. See `packages/core/src/providers/svt.ts` — it converts texttv.nu's per-page HTML output into the standard shape.
3. Register your provider in `packages/core/src/providers/index.ts` (add the import and a key in `PROVIDERS`).
4. Drop a `plugin/commands/<code>.md` file — copy `ct.md`, swap two `ct` instances and the description.
5. `npm run build` and commit `plugin/dist/`.

When a second provider is registered, the MCP `provider` argument becomes required and the CLI requires `--provider=<code>`. With a single provider, both default to it.

## What gets written to disk

| Path | Size | Purpose |
|------|------|---------|
| `~/.cache/teletext/<code>/latest.json` | ~1–5 MB per broadcaster | Single-file cache of that broadcaster's current snapshot. Overwritten in place. |

That's it. Nothing else is written. The cache TTL is 60 seconds. Use `/teletext:<code> refresh` to force a re-fetch.

## Topics (per broadcaster)

Semantic topics map to one or more teletext pages. Each broadcaster supplies its own topic table; not every key exists for every broadcaster.

ČT (`ct`):

| Key | Czech / meaning | Pages |
|-----|-----------------|-------|
| `news` | Zprávy (news headlines) | 101, 110–113, 130–132 |
| `news_domestic` | Z domova (domestic) | 110–115 |
| `news_world` | Ze světa (world) | 130–135 |
| `news_regional` | Z regionů (regional) | 150–153 |
| `weather` | Počasí | 170–174, 178–180 |
| `sport` | Sport | 200–204, 240, 250, 280, 290, 400 |
| `economy` | Finance / ekonomika | 500–502, 510, 520 |
| `tv_program` | TV program | 300–303, 310, 320 |
| `interests` | Zájmy / zajímavosti | 160, 600–620 |

SVT Text (`svt`):

| Key | Swedish / meaning | Pages |
|-----|-------------------|-------|
| `news` | Nyheter (headlines) | 100–109 |
| `news_domestic` | Inrikes | 101–103 |
| `news_world` | Utrikes | 104–112 |
| `weather` | Vädret | 400–405, 415 |
| `sport` | Sport | 300–308, 330 |
| `tv_program` | På TV | 600–603, 623 |
| `interests` | Blandat (misc) | 500 |

(SVT's economy section was discontinued upstream in 2024; that key is intentionally omitted.)

## MCP tools

Exposed by the bundled MCP server `api` (`dist/server.js`). The full LLM-visible tool path is `mcp__plugin_teletext_api__<tool>`. All page-fetching tools take a `provider` argument (broadcaster code). With one provider registered, `provider` is optional and defaults to it; with multiple, it's required.

| Tool | Args | Returns |
|------|------|---------|
| `list_providers` | optional `filter` | All registered broadcasters with metadata. Filter matches code/country/language/broadcaster name (e.g. "sweden", "cz", "ct"). |
| `get_page` | `provider?`, `page` (3 digits), optional `subpage` letter | Plain page text. |
| `get_index` | `provider?` | Master index parsed into topic→page entries. |
| `get_topic` | `provider?`, `topic` enum | Concatenated text for all pages in a topic. |
| `search` | `provider?`, `query` | Pages matching a substring, with snippets. |
| `refresh` | `provider?` | Forces cache refresh for that broadcaster. |

## Limitations

- **No history.** Teletext is a live ticker; the upstream APIs only expose the current snapshot. Questions like *"what was on page 130 yesterday?"* cannot be answered. The MCP tool descriptions tell Claude this so it doesn't claim otherwise.
- **Per-broadcaster language.** Page text is returned verbatim in the broadcaster's language. Claude can translate or summarize as needed.
- **Bulk fetch.** Both currently registered providers fetch all pages in one HTTP request and cache the snapshot for 60 s. SVT's source (texttv.nu) is a third-party aggregator, not a direct SVT endpoint.

## Migration notes

- **From v0.4 → v0.5:** repo restructured into an Nx + npm-workspaces monorepo with three publishable packages — `@honem/teletext-core`, `@honem/teletext-mcp`, `@honem/teletext-cli`. The same MCP server is now installable in any MCP-capable client via `npx -y @honem/teletext-mcp` (no Claude Code required). The Claude Code plugin shell is unchanged at the user surface — slash commands, MCP tool names, and cache layout are identical, but `plugin/dist/{server,cli}.js` are now esbuild-bundled single-file outputs. If you previously consumed `src/lib.ts` directly, switch the import to `@honem/teletext-core`. After pulling, `npm install && npm run build`, then in Claude Code: `/plugin uninstall teletext@honem && /plugin install teletext@honem && /reload-plugins`.
- **From v0.3 → v0.4:** MCP server renamed `teletext` → `api`; tools lost the `teletext_` prefix (`teletext_get_page` → `get_page`, etc.). LLM-visible tool path is now `mcp__plugin_teletext_api__<tool>` (no doubled "teletext"). Slash commands, CLI, and cache layout are unchanged. After updating the local repo, run `/plugin uninstall teletext@honem && /plugin install teletext@honem && /reload-plugins` to refresh the MCP tool registration.
- **From v0.2 → v0.3:** the keying changed from ISO 639-1 *language code* (`cs`) to short *broadcaster code* (`ct`, `svt`). The slash command went from `/teletext:cs` to `/teletext:ct`; the CLI flag went from `--country=cs` to `--provider=ct`. The MCP tool argument is now `provider` (was `country`). The cache directory `~/.cache/teletext/cs/` is unused — safe to `rm -rf`.
- **From v0.1 (`ct-teletext`):** the plugin was renamed `teletext`; install slug is `/plugin install teletext@honem`. The cache directory `~/.cache/ct-teletext/` is unused — safe to `rm -rf`.

### About the `teletext@honem` install slug

`<plugin>@<marketplace>` is the only valid install syntax in Claude Code — the `@` and the marketplace name are mandatory by design (no implicit resolution, no fuzzy match). The plugin itself is named **`teletext`**; **`honem`** is the marketplace (a personal namespace where future plugins can sit alongside `teletext`). So `teletext@honem` is already the shortest possible install slug.

## Development

```sh
npm install            # install devDeps (typescript, @types/node, esbuild, nx) and link workspace packages
npm run typecheck      # type-check the whole workspace
npm run build          # build all packages + bundle plugin/dist/
npm run build:packages # build only packages/*/dist
npm run build:plugin   # rebundle only plugin/dist/ (assumes packages already built)
npm run clean          # remove all dist/
npx nx run-many -t build   # equivalent to npm run build:packages, with Nx caching
```

Repository layout (Nx workspace + npm workspaces, single-marketplace single-plugin Claude Code shell):

```
ct-teletext-plugin/
├── nx.json                              # Nx target defaults + cache config
├── tsconfig.base.json                   # shared TS compiler options
├── tsconfig.json                        # solution-style references for tsc -b
├── AGENTS.md                            # cross-agent project context
├── .claude-plugin/marketplace.json      # marketplace "honem", points at ./plugin
├── packages/
│   ├── core/                            # @honem/teletext-core
│   │   ├── src/
│   │   │   ├── index.ts                 # barrel
│   │   │   ├── lib.ts                   # provider-agnostic core, makeProviderApi factory, default fetcher
│   │   │   └── providers/
│   │   │       ├── types.ts             # Provider, TopicTable, TeletextData, PageBlock
│   │   │       ├── ct.ts                # ČT — bulk JSON
│   │   │       ├── svt.ts               # SVT Text — texttv.nu, HTML→plain
│   │   │       └── index.ts             # registry + filter helpers
│   │   └── package.json + tsconfig.json
│   ├── mcp/                             # @honem/teletext-mcp (bin: teletext-mcp)
│   │   ├── src/server.ts                # MCP stdio server, depends on @honem/teletext-core
│   │   └── package.json + tsconfig.json
│   └── cli/                             # @honem/teletext-cli (bin: teletext)
│       ├── src/cli.ts
│       └── package.json + tsconfig.json
├── plugin/                              # Claude Code plugin (what gets installed via /plugin install)
│   ├── .claude-plugin/plugin.json       # name "teletext"
│   ├── .mcp.json                        # one MCP server "api" → dist/server.js
│   ├── commands/{list,ct,svt}.md        # /teletext:list, /teletext:ct, /teletext:svt
│   └── dist/{server,cli}.js             # esbuild-bundled, single-file, self-contained, committed
└── scripts/bundle-plugin.mjs            # produces plugin/dist via esbuild
```

## Credits

- ČT provider inspired by [`motuzj/ct-teletext-viewer`](https://github.com/motuzj/ct-teletext-viewer) (Python TUI). The current API endpoint is `https://api-teletext.ceskatelevize.cz/pages/text`.
- SVT provider uses the public [texttv.nu](https://texttv.nu) API by Joacim Stäbner — a third-party aggregator that mirrors SVT's teletext as JSON.
- Plugin shape & coverage list cross-referenced with [`defgsus/teletext-archive`](https://github.com/defgsus/teletext-archive) (deprecated German archive).

## License

MIT.
