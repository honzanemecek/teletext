# Project conventions

## Commits — Conventional Commits

```
<type>(<scope>)?: <subject>
```

| Type | When |
|------|------|
| `feat` | New user-visible behaviour |
| `fix` | Bug fix |
| `docs` | README, comments, JSDoc only |
| `chore` | Tooling, deps, release plumbing |
| `refactor` | Internal change, no behaviour delta |
| `perf` | Performance |
| `test` | Tests |
| `build` / `ci` | Build system / CI config |

Scopes used in this repo: `core`, `mcp`, `cli`, `plugin`, `release`.

Breaking changes: append `!` and add a `BREAKING CHANGE:` footer.

```
feat(core): platform-aware cache directory
fix(plugin): emit type:module so dist parses as ESM
chore(release): publish 1.0.0
```

## Versioning

Semver, lockstep across `@honem/teletext-{core,mcp,cli}`, `plugin/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`. The `^x.y.z` workspace dep ranges in mcp/cli are bumped in the same commit as the version.

## Don't commit

`node_modules/`, `packages/*/dist/`, `.nx/`. The one exception is `plugin/dist/` — that **is** committed so the marketplace install needs no build step.
