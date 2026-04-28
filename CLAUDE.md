# Project conventions

## Commits — Conventional Commits required

Every commit message must follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
<type>(<scope>)?: <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type       | When to use it                                                  |
|------------|-----------------------------------------------------------------|
| `feat`     | New user-visible feature                                        |
| `fix`      | Bug fix                                                         |
| `docs`     | README, comments, JSDoc — anything purely documentation         |
| `chore`    | Tooling, deps, scaffolding — no runtime change                  |
| `refactor` | Internal restructuring with no behavioural change               |
| `perf`     | Performance improvement                                         |
| `test`     | Adding or fixing tests                                          |
| `build`    | Build system, bundler, tsconfig                                 |
| `ci`       | CI/CD config                                                    |
| `style`    | Formatting only (no code change)                                |
| `revert`   | Reverts a prior commit                                          |

### Scopes (use when it makes the change clearer)

`core`, `mcp`, `cli`, `plugin`, `bundle`, `release`, `repo`

### Examples

```
feat(core): platform-aware cache directory
fix(plugin): emit type:module so dist bundle parses as ESM
docs(mcp): document VS Code Copilot Chat install
chore(release): publish 0.5.2 to npm
refactor(cli): extract argv parser into its own module
```

### Breaking changes

Append `!` after the type/scope, **and** include a `BREAKING CHANGE:` footer:

```
feat(core)!: rekey cache directory by broadcaster code

BREAKING CHANGE: cache moved from ~/.cache/teletext/<lang>/ to
~/.cache/teletext/<code>/. Old caches in the language-keyed paths
are unread and safe to delete.
```

## Versioning

Semver, in lockstep across all four published artifacts:

- `@honem/teletext-core`
- `@honem/teletext-mcp`
- `@honem/teletext-cli`
- the plugin (`plugin/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` metadata)

Bump together; the workspace dependency ranges (`mcp` and `cli` pinning `core` via `^x.y.z`) get updated in the same commit as the version bump.

## Don't

- Don't `--amend` commits that have been pushed.
- Don't push directly to `main` for non-trivial changes once a CI workflow exists (none yet — file an issue if you add one).
- Don't commit `node_modules/`, `packages/*/dist/`, or `.nx/`. The `.gitignore` already excludes these. The one exception is `plugin/dist/` — that **is** committed, by design, so the marketplace install needs no build step.
