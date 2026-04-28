# @honem/teletext-mcp

Teletext is alive and well — let your AI assistant read it.

An MCP (Model Context Protocol) server that exposes public-broadcaster teletext as tools your model can call. Works with Claude Desktop, Cursor, VS Code Copilot Chat, Continue, Goose, Windsurf, Cline, Codex CLI, and anything else that speaks MCP over stdio.

Currently registered: **ČT** (Czechia) and **SVT Text** (Sweden). More providers welcome.

## The one command everything reduces to

```sh
npx -y @honem/teletext-mcp
```

## Wire it into your client

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Cursor

`.cursor/mcp.json` (per-project) or `~/.cursor/mcp.json` (global) — same `mcpServers` shape as above.

### VS Code (Copilot Chat)

`.vscode/mcp.json`:

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

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.teletext]
command = "npx"
args = ["-y", "@honem/teletext-mcp"]
```

Continue, Goose, Cline, Windsurf — drop the same snippet into their respective config. They all converged on the same shape, bless them.

## What your model can now do

| Tool             | What it does                                               |
|------------------|------------------------------------------------------------|
| `list_providers` | Lists all broadcasters. Optional `filter` (e.g. "sweden"). |
| `get_page`       | Fetches a page (and subpage, if you ask) as plain text.    |
| `get_index`      | Returns the parsed topic → page-number table.              |
| `get_topic`      | Concatenates every page in a topic (news, weather, …).     |
| `search`         | Substring search across the whole snapshot.                |
| `refresh`        | Forces a fresh fetch, bypassing the 60-second cache.       |

With one provider registered, `provider` is optional. With several, your model picks one.

## Try it

> *"What teletexts are available?"* — `list_providers`
> *"Show me Swedish weather from teletext."* — `get_topic` with `provider=svt`, `topic=weather`
> *"Search Czech teletext for Babiš."* — `search` with `provider=ct`

## What lands on disk

One file per broadcaster: `~/.cache/teletext/<code>/latest.json`. ~1–5 MB, overwritten in place, 60-second TTL. That's it.

## Caveats

Teletext is a live ticker — there's no history. If you ask "what was on page 130 yesterday?", the answer is *we don't know and neither do they*. The tool descriptions tell your model this so it doesn't make things up.

## License

MIT.
