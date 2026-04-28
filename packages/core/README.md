# @honem/teletext-core

The boring-but-important brains behind [`@honem/teletext-mcp`](https://www.npmjs.com/package/@honem/teletext-mcp) and [`@honem/teletext-cli`](https://www.npmjs.com/package/@honem/teletext-cli).

A provider-agnostic teletext library: fetch a broadcaster's snapshot, cache it for a minute, then ask it for pages, topics, indexes, or full-text matches. Zero runtime dependencies — just plain Node ESM.

## Install

```sh
npm install @honem/teletext-core
```

## Use it

```ts
import { makeProviderApi, getProvider } from "@honem/teletext-core";

const api = makeProviderApi(getProvider("ct"));   // or "svt"

await api.getPage("100");          // master index, plain text
await api.getPage("170", "B");     // page 170, subpage B
await api.getTopic("weather");     // all weather pages, concatenated
await api.search("počasí");        // substring hits with snippets
await api.getIndex();              // parsed topic → page-number map
await api.refresh();               // bust the 60s cache
```

## Currently shipped providers

| Code  | Broadcaster              | Country | Language |
|-------|--------------------------|---------|----------|
| `ct`  | Česká televize           | CZ      | cs       |
| `svt` | Sveriges Television Text | SE      | sv       |

`getAllProviders()` lists them. `filterProviders("sweden")` does the obvious thing.

## Adding your own broadcaster

Implement the `Provider` interface from `providers/types.ts`, plug it into the registry, and the MCP server + CLI pick it up automatically. See the [main README](https://github.com/honzanemecek/teletext#adding-a-broadcaster) for the four-step recipe.

## License

MIT.
