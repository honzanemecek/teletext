#!/usr/bin/env node
import {
  makeProviderApi,
  type ProviderApi,
  type PageResult,
  findProviders,
  getProvider,
  listProviders,
  type Provider,
  type TopicKey,
} from "@honem/teletext-core";

const RULE = "─".repeat(40);

function header(title: string): string {
  return `${RULE}\n${title}\n${RULE}`;
}

function formatPage(label: string, p: PageResult): string {
  const subInfo =
    p.availableSubpages.length > 1
      ? ` (subpage ${p.subpage} of ${p.availableSubpages.join("")})`
      : "";
  return `${header(`${label} — page ${p.page}${subInfo}`)}\n${p.text}`;
}

function parsePageArg(arg: string): { page: string; subpage?: string } {
  const m = arg.match(/^(\d{3})(?:[-]?([A-Za-z]|\d+))?$/);
  if (!m) throw new Error(`Invalid page: "${arg}". Expected 3 digits, optionally with subpage (e.g. 170, 170-2, 170B).`);
  return { page: m[1]!, subpage: m[2] };
}

function helpText(api: ProviderApi | null, codes: string[]): string {
  const topicKeys = api ? api.listTopics().map((t) => t.key).join(", ") : "(provider-dependent)";
  const providerHint =
    codes.length > 1
      ? `\nProvider:\n  --provider=<code>      Required. Known: ${codes.join(", ")}.`
      : api
        ? `\nProvider: ${api.provider.code} (${api.provider.broadcaster}) — single registered provider.`
        : "";
  const example = api?.provider.code ?? codes[0] ?? "<code>";
  return `Usage: teletext [--provider=<code>] [command] [args]

Commands:
  <page>[-sub|letter]    Show a teletext page (e.g. 100, 170-2, 200B). Default: 100.
  page <page>[-sub]      Same as above, explicit form.
  index                  Show the master index (page 100), parsed.
  search <query>         Search all pages for a substring.
  topic <name>           Show all pages for a topic. Names: ${topicKeys}.
  topics                 List supported topics.
  refresh                Force-refresh the local cache.
  list [filter]          List all registered broadcasters; optional filter by country/language/code.
  help                   Show this help.
${providerHint}

Examples:
  teletext --provider=${example}              # master index
  teletext --provider=${example} 170          # page 170, subpage A
  teletext --provider=${example} 170-2        # page 170, subpage B
  teletext --provider=${example} search počasí
  teletext --provider=${example} topic news_world
  teletext list                       # list all broadcasters
  teletext list cz                    # filter by country/language/code
`;
}

function pickProvider(argv: string[]): { provider: Provider; rest: string[] } {
  const codes = listProviders().map((p) => p.code);
  let providerArg: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--provider=")) {
      providerArg = a.slice("--provider=".length);
    } else if (a === "--provider" || a === "-p") {
      providerArg = argv[i + 1];
      i += 1;
    } else {
      rest.push(a);
    }
  }

  if (!providerArg) {
    if (codes.length === 1) {
      return { provider: getProvider(codes[0]!)!, rest };
    }
    process.stderr.write(
      `teletext: --provider=<code> required. Known: ${codes.join(", ")}.\n`,
    );
    process.exit(2);
  }

  const provider = getProvider(providerArg);
  if (!provider) {
    process.stderr.write(
      `teletext: unknown provider "${providerArg}". Known: ${codes.join(", ")}.\n`,
    );
    process.exit(2);
  }
  return { provider, rest };
}

async function cmdPage(api: ProviderApi, arg: string | undefined): Promise<void> {
  const { page, subpage } = parsePageArg(arg ?? "100");
  const result = await api.getPage(page, subpage);
  process.stdout.write(formatPage(api.provider.label, result) + "\n");
}

async function cmdIndex(api: ProviderApi): Promise<void> {
  const { raw, entries } = await api.getIndex();
  const indexPage = api.provider.indexPage ?? "100";
  process.stdout.write(header(`${api.provider.label} — page ${indexPage} (master index)`) + "\n");
  process.stdout.write(raw + "\n");
  if (entries.length) {
    process.stdout.write("\nParsed entries:\n");
    for (const e of entries) {
      process.stdout.write(`  ${e.topic.padEnd(28, " ")} ${e.pages}\n`);
    }
  }
}

async function cmdSearch(api: ProviderApi, query: string | undefined): Promise<void> {
  if (!query) {
    process.stderr.write("teletext search: missing query\n");
    process.exit(2);
  }
  const hits = await api.search(query);
  if (!hits.length) {
    process.stdout.write(`No matches for "${query}".\n`);
    return;
  }
  process.stdout.write(header(`${api.provider.label} — search: "${query}" (${hits.length} hits)`) + "\n");
  for (const h of hits) {
    const sub = h.subpage ? `-${h.subpage}` : "";
    process.stdout.write(`  ${h.page}${sub}  ${h.snippet}\n`);
  }
}

async function cmdTopic(api: ProviderApi, name: string | undefined): Promise<void> {
  if (!name) {
    process.stderr.write("teletext topic: missing topic name. See 'teletext topics'.\n");
    process.exit(2);
  }
  const known = api.listTopics().map((t) => t.key);
  if (!known.includes(name as TopicKey)) {
    process.stderr.write(`teletext topic: unknown topic "${name}". Known for ${api.provider.code}: ${known.join(", ")}.\n`);
    process.exit(2);
  }
  const { topic, pages } = await api.getTopic(name as TopicKey);
  process.stdout.write(header(`${api.provider.label} — topic: ${topic.label}`) + "\n");
  if (!pages.length) {
    process.stdout.write("(No pages from this topic are present in the current snapshot.)\n");
    return;
  }
  for (const p of pages) {
    process.stdout.write(`\n${formatPage(api.provider.label, p)}\n`);
  }
}

function cmdTopics(api: ProviderApi): void {
  process.stdout.write(header(`${api.provider.label} — topics`) + "\n");
  for (const t of api.listTopics()) {
    process.stdout.write(`  ${t.key.padEnd(16, " ")} ${t.label}\n      pages: ${t.pages.join(", ")}\n`);
  }
}

async function cmdRefresh(api: ProviderApi): Promise<void> {
  const data = await api.fetchAll({ force: true });
  const count = Object.keys(data.data).length;
  process.stdout.write(`Refreshed cache for ${api.provider.code}. ${count} pages cached.\n`);
}

function cmdList(filter?: string): void {
  const matches = findProviders(filter);
  if (!matches.length) {
    if (filter) {
      const all = listProviders().map((p) => p.code).join(", ");
      process.stdout.write(`No broadcasters match "${filter}". Registered: ${all}.\n`);
    } else {
      process.stdout.write("No broadcasters registered.\n");
    }
    return;
  }
  const title = filter
    ? `Teletext broadcasters matching "${filter}" (${matches.length})`
    : `Teletext broadcasters (${matches.length})`;
  process.stdout.write(header(title) + "\n");
  for (const p of matches) {
    process.stdout.write(
      `  /teletext:${p.code.padEnd(8, " ")} ${p.broadcaster} — ${p.countryName} (${p.country}, lang ${p.language})\n` +
        `      ${p.description}\n`,
    );
  }
  process.stdout.write("\nFilter examples: `teletext list cz`, `teletext list de`, `teletext list ct`.\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const codes = listProviders().map((p) => p.code);

  // The `list` and `help` subcommands work without a provider context — handle them up-front.
  const standalone = argv[0];
  if (standalone === "list") {
    return cmdList(argv[1]);
  }

  const wantsHelp = argv.length === 0 || ["help", "--help", "-h"].includes(standalone ?? "");
  if (wantsHelp && codes.length > 1 && !argv.some((a) => a.startsWith("--provider") || a === "-p")) {
    process.stdout.write(helpText(null, codes));
    return;
  }

  const { provider, rest } = pickProvider(argv);
  const api = makeProviderApi(provider);
  const cmd = rest[0];

  try {
    if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
      process.stdout.write(helpText(api, codes));
      return;
    }
    if (cmd === "index") return cmdIndex(api);
    if (cmd === "search") return cmdSearch(api, rest.slice(1).join(" "));
    if (cmd === "topic") return cmdTopic(api, rest[1]);
    if (cmd === "topics") return cmdTopics(api);
    if (cmd === "refresh") return cmdRefresh(api);
    if (cmd === "page") return cmdPage(api, rest[1]);
    if (/^\d{3}/.test(cmd)) return cmdPage(api, cmd);

    process.stderr.write(`teletext: unknown command "${cmd}"\n\n${helpText(api, codes)}`);
    process.exit(2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`teletext: ${msg}\n`);
    process.exit(1);
  }
}

void main();
