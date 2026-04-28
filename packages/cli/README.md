# @honem/teletext-cli

Teletext, in your terminal, in one command. No install required, no config, no nostalgia license needed.

```sh
npx -y @honem/teletext-cli list                  # all broadcasters
npx -y @honem/teletext-cli --provider=ct 100     # ČT page 100
npx -y @honem/teletext-cli --provider=svt 100    # SVT page 100
```

Useful for shell-capable agents (you, scripts, your favorite CI cron job that absolutely needs the Czech weather report) or just for piping page text into `less`.

## Install (optional)

```sh
npm install -g @honem/teletext-cli
teletext --provider=ct 100
```

Or skip the install and stay on `npx -y` — both work.

## What it can do

```text
teletext list                              # show registered broadcasters
teletext list sweden                       # filter by country/language/code

teletext --provider=ct 100                 # page 100
teletext --provider=ct 170-2               # page 170, subpage B (also: 170B)
teletext --provider=ct index               # parsed topic → page table
teletext --provider=ct search počasí       # full-text search
teletext --provider=ct topic sport         # concatenate all sport pages
teletext --provider=ct topics              # list semantic topics
teletext --provider=ct refresh             # force-refresh cache
teletext --provider=ct help                # per-provider help
```

Swap `ct` for `svt` for the Swedish version. With only one provider registered, `--provider` becomes optional.

## Currently registered

| Code  | Broadcaster              | Country | Language |
|-------|--------------------------|---------|----------|
| `ct`  | Česká televize           | CZ      | cs       |
| `svt` | Sveriges Television Text | SE      | sv       |

## Cache

One file per broadcaster at `~/.cache/teletext/<code>/latest.json`. ~1–5 MB, overwritten in place, 60-second TTL. Use `refresh` to bust it.

## Why a CLI when there's an MCP server?

Because not every agent speaks MCP, and sometimes you just want to type a thing and read it. The CLI and MCP server share the same brain ([`@honem/teletext-core`](https://www.npmjs.com/package/@honem/teletext-core)) — same data, same cache, same providers.

## License

MIT.
