---
description: List all registered teletext broadcasters (optionally filter by country/language/code).
argument-hint: "[filter]"
allowed-tools: ["Bash"]
---

List every teletext broadcaster known to this plugin, with country, language, and a short description. Pass an optional filter to narrow by country (`cz`, `germany`), language (`cs`, `de`), or broadcaster code (`ct`).

!`node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" list $ARGUMENTS`
