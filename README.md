# Teletext for AI agents

> *Long live teletext!*

[![npm](https://img.shields.io/npm/v/%40honem%2Fteletext-mcp?label=%40honem%2Fteletext-mcp)](https://www.npmjs.com/package/@honem/teletext-mcp)
[![npm](https://img.shields.io/npm/v/%40honem%2Fteletext-cli?label=%40honem%2Fteletext-cli)](https://www.npmjs.com/package/@honem/teletext-cli)
[![npm](https://img.shields.io/npm/v/%40honem%2Fteletext-core?label=%40honem%2Fteletext-core)](https://www.npmjs.com/package/@honem/teletext-core)

Read public-broadcaster teletext (Czech ČT, Swedish SVT, more on request) from Claude Code, Claude Desktop, Cursor, VS Code, Continue, Goose, Windsurf, Cline, Codex CLI — anything that speaks MCP, plus a plain CLI for everything else.

> *"List the teletext broadcasters."*
> *"Show me Swedish weather from teletext."*
> *"Search Czech teletext for 'Babiš'."*

Zero runtime dependencies. One bulk fetch per broadcaster, cached for 60 seconds.

## Pick your install

| You use… | Install with… |
|----------|---------------|
| **Claude Code** (CLI / desktop wrapper) | `/plugin marketplace add honzanemecek/teletext` then `/plugin install teletext@honem` — gives you slash commands **and** the MCP tools |
| **Claude Desktop / Cursor / VS Code / Continue / Goose / Windsurf / Cline / Codex CLI** | Add the MCP server snippet below to that client's config |
| **A shell, a script, a CI job** | `npx -y @honem/teletext-cli list` |

### MCP server snippet (works for most clients)

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

Drop that into the right config file, restart the client, ask in plain English:

| Client | Config file |
|--------|-------------|
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor (per-project / global) | `.cursor/mcp.json` / `~/.cursor/mcp.json` |
| VS Code Copilot Chat | `.vscode/mcp.json` (use `"servers"` instead of `"mcpServers"`, add `"type": "stdio"`) |
| Continue | `~/.continue/config.json` |
| Cline | `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` |
| Windsurf | the MCP settings panel |

Goose uses YAML (`~/.config/goose/config.yaml`):

```yaml
extensions:
  teletext:
    type: stdio
    cmd: npx
    args: ["-y", "@honem/teletext-mcp"]
    enabled: true
```

Codex CLI uses TOML (`~/.codex/config.toml`):

```toml
[mcp_servers.teletext]
command = "npx"
args = ["-y", "@honem/teletext-mcp"]
```

### CLI

```sh
npx -y @honem/teletext-cli list                 # all broadcasters
npx -y @honem/teletext-cli --provider=ct 100    # ČT page 100
npx -y @honem/teletext-cli --provider=svt 100   # SVT page 100
npx -y @honem/teletext-cli --provider=ct help   # per-provider help
```

Or install once: `npm install -g @honem/teletext-cli`, then `teletext --provider=ct 100`.

## What you can do

In a chat (with the MCP server enabled):

> *"What teletexts are available?"* → `list_providers`
> *"Show me Swedish weather from teletext."* → `get_topic` with `provider=svt`, `topic=weather`
> *"Search Czech teletext for 'Babiš'."* → `search` with `provider=ct`

In Claude Code (slash commands):

```text
/teletext:list                  # all broadcasters
/teletext:list sweden           # filter by country/language/code

/teletext:ct                    # ČT master index (page 100)
/teletext:ct 170                # ČT weather, page A
/teletext:ct 170-2              # subpage B (also: /teletext:ct 170B)
/teletext:ct index              # parsed topic → page-number table
/teletext:ct search počasí      # full-text search
/teletext:ct topic sport        # all sport pages, concatenated
/teletext:ct topics             # list semantic topics
/teletext:ct refresh            # force-refresh cache

/teletext:svt 100               # SVT Text headlines
/teletext:svt index             # SVT master index (page 700)
/teletext:svt search Stockholm
/teletext:svt topic weather
```

## Currently registered broadcasters

| Code  | Broadcaster                  | Country     | Language | Source |
|-------|------------------------------|-------------|----------|--------|
| `ct`  | Česká televize (ČT Teletext) | Czechia     | cs       | Direct ČT API (bulk JSON) |
| `svt` | Sveriges Television (SVT Text) | Sweden    | sv       | Public [texttv.nu](https://texttv.nu) aggregator |

PRs welcome — see [Adding a broadcaster](#adding-a-broadcaster).

## MCP tools

All registered tools are namespaced `mcp__plugin_teletext_api__<tool>` to the LLM. With one provider registered the `provider` argument is optional; with multiple it's required.

| Tool | Args | Returns |
|------|------|---------|
| `list_providers` | optional `filter` | All registered broadcasters with metadata. Filter matches code/country/language/broadcaster name (e.g. "sweden", "cz", "ct"). |
| `get_page` | `provider?`, `page` (3 digits), optional `subpage` letter | Plain page text. |
| `get_index` | `provider?` | Master index parsed into topic → page entries. |
| `get_topic` | `provider?`, `topic` | Every page in that topic, concatenated. |
| `search` | `provider?`, `query` | Pages matching a substring, with snippets. |
| `refresh` | `provider?` | Forces cache refresh. |

## Topics

Semantic groupings that map to one or more teletext pages. Each broadcaster supplies its own topic table — not every key exists for every broadcaster.

**ČT (`ct`)**

| Key | Czech / meaning | Pages |
|-----|-----------------|-------|
| `news` | Zprávy (headlines) | 101, 110–113, 130–132 |
| `news_domestic` | Z domova | 110–115 |
| `news_world` | Ze světa | 130–135 |
| `news_regional` | Z regionů | 150–153 |
| `weather` | Počasí | 170–174, 178–180 |
| `sport` | Sport | 200–204, 240, 250, 280, 290, 400 |
| `economy` | Finance / ekonomika | 500–502, 510, 520 |
| `tv_program` | TV program | 300–303, 310, 320 |
| `interests` | Zájmy / zajímavosti | 160, 600–620 |

**SVT Text (`svt`)**

| Key | Swedish / meaning | Pages |
|-----|-------------------|-------|
| `news` | Nyheter (headlines) | 100–109 |
| `news_domestic` | Inrikes | 101–103 |
| `news_world` | Utrikes | 104–112 |
| `weather` | Vädret | 400–405, 415 |
| `sport` | Sport | 300–308, 330 |
| `tv_program` | På TV | 600–603, 623 |
| `interests` | Blandat | 500 |

(SVT discontinued its economy section in 2024; that key is intentionally omitted.)

## What gets written to disk

One file per broadcaster, per OS conventions:

| Platform | Path |
|----------|------|
| Linux    | `$XDG_CACHE_HOME/teletext/<code>/latest.json` (defaults to `~/.cache/teletext/<code>/latest.json`) |
| macOS    | `~/Library/Caches/teletext/<code>/latest.json` |
| Windows  | `%LOCALAPPDATA%\teletext\Cache\<code>\latest.json` |

~1–5 MB per broadcaster, overwritten in place, 60-second TTL. Use `refresh` to bust it. Nothing else is written.

## Limitations

- **No history.** Teletext is a live ticker; the upstream APIs only expose the current snapshot. Questions like *"what was on page 130 yesterday?"* cannot be answered.
- **Per-broadcaster language.** Pages are returned verbatim in the broadcaster's language. Claude will translate or summarize as needed.
- **Bulk fetch.** Each broadcaster is one big HTTP request (~1 MB), cached for 60 s. SVT's source is a third-party aggregator (texttv.nu), not a direct SVT endpoint.

## Adding a broadcaster

The core is provider-modular. To wire up a new one (no other edits required):

1. Create `packages/core/src/providers/<code>.ts` exporting a `Provider`. See `providers/types.ts` for the full shape.
2. If the upstream's response shape differs from ČT's `{ data: { "100": {...} } }` bulk JSON, supply `fetchSnapshot(provider)` that returns a normalized `TeletextData`. SVT does this — it converts texttv.nu's per-page HTML into the standard shape.
3. Register the provider in `packages/core/src/providers/index.ts`.
4. Drop a `plugin/commands/<code>.md` file — copy `ct.md`, swap two `ct` instances and the description.
5. `npm run build` and commit `plugin/dist/`.

When a second provider is registered, the MCP `provider` argument becomes required and the CLI requires `--provider=<code>`. With a single provider, both default to it.

## Development

```sh
npm install
npm run typecheck      # type-check the whole workspace
npm run build          # build all packages + bundle plugin/dist/
npm run build:packages # build only packages/*/dist
npm run build:plugin   # rebundle only plugin/dist/
npm run clean          # remove all dist/
```

Layout (Nx + npm workspaces, single-marketplace, single-plugin):

```
.claude-plugin/marketplace.json      # marketplace "honem", points at ./plugin
packages/
├── core/   # @honem/teletext-core — provider-agnostic library
├── mcp/    # @honem/teletext-mcp  — stdio MCP server (bin: teletext-mcp)
└── cli/    # @honem/teletext-cli  — CLI (bin: teletext)
plugin/                              # Claude Code plugin
├── .claude-plugin/plugin.json
├── .mcp.json                        # one MCP server "api" → dist/server.js
├── commands/{list,ct,svt}.md        # /teletext:list, /teletext:ct, /teletext:svt
└── dist/{server,cli}.js             # esbuild-bundled, committed for offline install
scripts/bundle-plugin.mjs            # produces plugin/dist via esbuild
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) — see [`CLAUDE.md`](./CLAUDE.md).

## Credits

- ČT provider inspired by [`motuzj/ct-teletext-viewer`](https://github.com/motuzj/ct-teletext-viewer).
- SVT provider uses the public [texttv.nu](https://texttv.nu) API by Joacim Stäbner.
- Plugin shape cross-referenced with [`defgsus/teletext-archive`](https://github.com/defgsus/teletext-archive).

## License

MIT.
