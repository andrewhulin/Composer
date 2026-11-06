import type { SourcePlatform } from "@composer/core";
import { SECRET, type SecretKey } from "../platform/secrets";
import { NOTION_VERSION } from "../requests/queue";

/** Everything Composer connects to: the model, the sources, and where it ships. */
export type IntegrationId = "anthropic" | "linear" | "figma" | "arena" | "pinterest" | "slack" | "statsig" | "notion" | "github";

/** What a token test learned. `unreachable` means the service couldn't be asked, not that the token is bad. */
export type TestResult = { ok: true; who?: string } | { ok: false; reason: string; expired?: boolean; unreachable?: boolean };

/** fetch, injected so tests can answer for the services. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The mock a coded guide draws for a step: a window titled `screen`, a list of `items`, and the
 * one at `target` highlighted with the cursor on it. `field` draws Composer's paste field instead.
 */
export interface Mock {
  screen: string;
  items?: string[];
  target?: number;
  field?: string;
}

export interface GuideStep {
  title: string;
  detail: string;
  /** Opens in the browser, when there's a page to go to. */
  link?: { label: string; url: string };
  mock: Mock;
}

export interface Integration {
  id: IntegrationId;
  name: string;
  /** What it gives Composer, in one line. */
  gives: string;
  /** token: a secret pasted here and kept in Keychain. cli: the GitHub CLI's own sign-in. none: nothing to set up. */
  auth: { kind: "token"; secret: SecretKey; placeholder: string; optional?: boolean } | { kind: "cli" } | { kind: "none" };
  /** Source nodes from this platform need it. */
  platform?: SourcePlatform;
  /** Composer can't run at all without it. */
  alwaysRequired?: boolean;
  steps: GuideStep[];
  test?: (token: string, fetcher: Fetcher) => Promise<TestResult>;
}

/** Reads a JSON answer, turning HTTP status into a TestResult. */
async function ask(fetcher: Fetcher, url: string, init: RequestInit, name: string): Promise<{ ok: true; body: unknown } | Extract<TestResult, { ok: false }>> {
  let res: Response;
  try {
    res = await fetcher(url, init);
  } catch {
    return { ok: false, reason: `Couldn't reach ${name} to check. The token is kept; check again when you're online.`, unreachable: true };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: `${name} rejected this token. Make a new one and paste it again.` };
  if (!res.ok) return { ok: false, reason: `${name} answered ${res.status}. Try again in a moment.`, unreachable: true };
  try {
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: true, body: null };
  }
}

const field = (what: string): Mock => ({ screen: "Composer · Connectors", field: what });

export const INTEGRATIONS: Integration[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    gives: "Claude, for every node. Composer can't run without it.",
    auth: { kind: "token", secret: SECRET.anthropic, placeholder: "sk-ant-…" },
    alwaysRequired: true,
    steps: [
      { title: "Open API keys in the Claude Console", detail: "Sign in with the account that should pay for Composer's calls.", link: { label: "Open console.anthropic.com", url: "https://console.anthropic.com/settings/keys" }, mock: { screen: "Claude Console · Settings", items: ["Workspaces", "API keys", "Limits", "Billing"], target: 1 } },
      { title: "Create a key", detail: "Name it Composer, so you can tell it apart later.", mock: { screen: "API keys", items: ["Default", "Batch jobs", "+ Create key"], target: 2 } },
      { title: "Copy the key", detail: "It's shown once. It starts with sk-ant-.", mock: { screen: "Your new key", items: ["sk-ant-api03-••••••••", "Copy key"], target: 1 } },
      { title: "Paste it here and test", detail: "Composer checks it with a free token count, then keeps it in your Keychain.", mock: field("sk-ant-…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(
        fetcher,
        "https://api.anthropic.com/v1/messages/count_tokens",
        {
          method: "POST",
          headers: { "x-api-key": token, "anthropic-version": "2023-06-01", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: "claude-opus-5-5", messages: [{ role: "user", content: "ping" }] }),
        },
        "Anthropic",
      );
      return r.ok ? { ok: true, who: "Claude Opus 5.5" } : r;
    },
  },
  {
    id: "linear",
    name: "Linear",
    gives: "Tickets and their comments, from a pasted issue link.",
    auth: { kind: "token", secret: SECRET.linear, placeholder: "lin_api_…" },
    platform: "linear",
    steps: [
      { title: "Open Security & access", detail: "In Linear: Settings → Account → Security & access.", link: { label: "Open Linear settings", url: "https://linear.app/settings/account/security" }, mock: { screen: "Linear · Settings", items: ["Preferences", "Profile", "Notifications", "Security & access"], target: 3 } },
      { title: "Make a personal API key", detail: "Under Personal API keys, choose New API key and name it Composer. Read access is enough.", mock: { screen: "Security & access", items: ["Sessions", "Passkeys", "Personal API keys · New key"], target: 2 } },
      { title: "Copy it", detail: "It starts with lin_api_.", mock: { screen: "New API key", items: ["lin_api_••••••••", "Copy"], target: 1 } },
      { title: "Paste it here and test", detail: "Composer asks Linear who you are, then keeps the key in Keychain.", mock: field("lin_api_…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://api.linear.app/graphql", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ query: "{ viewer { name email } }" }) }, "Linear");
      if (!r.ok) return r;
      const body = r.body as { data?: { viewer?: { name?: string; email?: string } }; errors?: { message: string }[] } | null;
      if (body?.errors?.length || !body?.data?.viewer) return { ok: false, reason: "Linear rejected this key. Make a new one and paste it again." };
      return { ok: true, who: body.data.viewer.name ?? body.data.viewer.email };
    },
  },
  {
    id: "figma",
    name: "Figma",
    gives: "Frames as thumbnails and their text, from a pasted file or frame link.",
    auth: { kind: "token", secret: SECRET.figma, placeholder: "figd_…" },
    platform: "figma",
    steps: [
      { title: "Open your Figma settings", detail: "From the file browser: your name → Settings.", link: { label: "Open Figma settings", url: "https://www.figma.com/settings" }, mock: { screen: "Figma · Settings", items: ["Account", "Notifications", "Security", "Sessions"], target: 2 } },
      { title: "Generate a personal access token", detail: "Security → Personal access tokens → Generate new token. Name it Composer.", mock: { screen: "Security", items: ["Two-factor authentication", "Personal access tokens", "Generate new token"], target: 2 } },
      { title: "Give it read access to file content", detail: "Scopes: File content, read only. Pick how long it lasts.", mock: { screen: "New token · Scopes", items: ["File content · Read only", "Comments · No access", "Dev resources · No access"], target: 0 } },
      { title: "Copy, paste here and test", detail: "It starts with figd_. Composer asks Figma whose token it is.", mock: field("figd_…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://api.figma.com/v1/me", { headers: { "X-Figma-Token": token } }, "Figma");
      if (!r.ok) return r;
      const me = r.body as { handle?: string; email?: string } | null;
      return { ok: true, who: me?.handle ?? me?.email };
    },
  },
  {
    id: "arena",
    name: "Are.na",
    gives: "Channel blocks as references. Public channels need no token.",
    auth: { kind: "token", secret: SECRET.arena, placeholder: "Personal access token", optional: true },
    platform: "arena",
    steps: [
      { title: "Only for private channels", detail: "Public channels work without a token. Skip this unless the channel is private.", mock: { screen: "Are.na · Channel", items: ["Public · works now", "Closed", "Private · needs a token"], target: 2 } },
      { title: "Open Are.na's developer page", detail: "Create an application. Its page shows a personal access token.", link: { label: "Open dev.are.na", url: "https://dev.are.na/oauth/applications" }, mock: { screen: "dev.are.na · Applications", items: ["Your applications", "+ New application"], target: 1 } },
      { title: "Copy the token, paste here and test", detail: "Composer asks Are.na whose token it is.", mock: field("Personal access token") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://api.are.na/v2/me", { headers: { Authorization: `Bearer ${token}` } }, "Are.na");
      if (!r.ok) return r;
      const me = r.body as { username?: string; slug?: string } | null;
      return { ok: true, who: me?.username ?? me?.slug };
    },
  },
  {
    id: "pinterest",
    name: "Pinterest",
    gives: "A board's pins as images, read from the board's public feed.",
    auth: { kind: "none" },
    platform: "pinterest",
    steps: [
      { title: "Make sure the board is public", detail: "Secret boards have no feed Composer can read.", mock: { screen: "Pinterest · Board", items: ["Edit board", "Keep this board secret · off"], target: 1 } },
      { title: "Copy the board's link", detail: "From the address bar, like pinterest.com/you/board-name.", mock: { screen: "Browser", items: ["pinterest.com/you/onboarding-refs"], target: 0 } },
      { title: "Paste it on the canvas", detail: "⌘V on the Understand canvas adds it as a source. Nothing to set up here.", mock: field("Paste a board link on the canvas") },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    gives: "Posts Validate's questions to a channel and brings the replies back as evidence.",
    auth: { kind: "token", secret: SECRET.slack, placeholder: "xoxp-…" },
    platform: "slack",
    steps: [
      { title: "Create a Slack app", detail: "From scratch, in the workspace you'll post feedback to.", link: { label: "Open api.slack.com/apps", url: "https://api.slack.com/apps?new_app=1" }, mock: { screen: "Slack API · Your apps", items: ["Create New App", "From scratch"], target: 1 } },
      { title: "Add user token scopes", detail: "OAuth & Permissions → User Token Scopes: channels:history, groups:history, chat:write.", mock: { screen: "OAuth & Permissions", items: ["channels:history", "groups:history", "chat:write", "+ Add an OAuth Scope"], target: 3 } },
      { title: "Install it and copy the user token", detail: "Install to Workspace, then copy the User OAuth Token. It starts with xoxp-.", mock: { screen: "OAuth Tokens", items: ["Install to Workspace", "User OAuth Token · xoxp-••••"], target: 1 } },
      { title: "Paste it here and test", detail: "Composer asks Slack who you are. Then add the feedback channel ID below.", mock: field("xoxp-…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` } }, "Slack");
      if (!r.ok) return r;
      const body = r.body as { ok?: boolean; error?: string; user?: string; team?: string } | null;
      if (body?.ok) return { ok: true, who: [body.user, body.team].filter(Boolean).join(" · ") || undefined };
      const expired = body?.error === "token_expired" || body?.error === "token_revoked";
      return { ok: false, expired, reason: expired ? "This Slack token has expired or was revoked. Install the app again and paste the new token." : `Slack said ${body?.error ?? "no"}. Check the token and its scopes.` };
    },
  },
  {
    id: "statsig",
    name: "Statsig",
    gives: "Experiment results for Validate's scorecard.",
    auth: { kind: "token", secret: SECRET.statsig, placeholder: "console-…" },
    platform: "statsig",
    steps: [
      { title: "Open Keys & Environments", detail: "In the Statsig console: Project settings → Keys & Environments.", link: { label: "Open the Statsig console", url: "https://console.statsig.com" }, mock: { screen: "Statsig · Project settings", items: ["General", "Members", "Keys & Environments"], target: 2 } },
      { title: "Generate a Console API key", detail: "Generate new key → Console. Read-only is enough.", mock: { screen: "Keys & Environments", items: ["Server secret keys", "Client keys", "Console API keys · Generate"], target: 2 } },
      { title: "Copy, paste here and test", detail: "It starts with console-. Composer lists one experiment to check it.", mock: field("console-…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://statsigapi.net/console/v1/experiments?limit=1", { headers: { "STATSIG-API-KEY": token } }, "Statsig");
      return r.ok ? { ok: true } : r;
    },
  },
  {
    id: "notion",
    name: "Notion",
    gives: "⌘K → Request a feature adds rows to your Dev queue.",
    auth: { kind: "token", secret: SECRET.notion, placeholder: "ntn_…" },
    steps: [
      { title: "Make an internal integration", detail: "Name it Composer, in the workspace that has your Dev queue.", link: { label: "Open Notion integrations", url: "https://www.notion.so/profile/integrations" }, mock: { screen: "Notion · Integrations", items: ["Internal", "Public", "+ New integration"], target: 2 } },
      { title: "Copy its secret", detail: "Configuration → Internal Integration Secret. It starts with ntn_.", mock: { screen: "Composer · Configuration", items: ["Capabilities · Read, Insert", "Internal Integration Secret · Show"], target: 1 } },
      { title: "Share the Dev queue with it", detail: "On the database: ••• → Connections → Composer.", mock: { screen: "Dev queue", items: ["Copy link", "Connections", "Composer"], target: 2 } },
      { title: "Paste it here and test", detail: "Composer asks Notion which integration it is. Add the database link in Settings → Requests.", mock: field("ntn_…") },
    ],
    test: async (token, fetcher) => {
      const r = await ask(fetcher, "https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION } }, "Notion");
      if (!r.ok) return r;
      const me = r.body as { name?: string } | null;
      return { ok: true, who: me?.name };
    },
  },
  {
    id: "github",
    name: "GitHub",
    gives: "Opens Share's pull requests through the GitHub CLI.",
    auth: { kind: "cli" },
    steps: [
      { title: "Install the GitHub CLI", detail: "With Homebrew: brew install gh. Or download it from cli.github.com.", link: { label: "Open cli.github.com", url: "https://cli.github.com" }, mock: { screen: "Terminal", items: ["$ brew install gh"], target: 0 } },
      { title: "Sign in", detail: "In Terminal, run gh auth login and follow it through the browser.", mock: { screen: "Terminal", items: ["$ gh auth login", "? Where do you use GitHub?  GitHub.com"], target: 0 } },
      { title: "Come back and test", detail: "Composer asks gh which account it's signed in as. No token is stored here.", mock: field("Test asks gh for your account") },
    ],
  },
];

export const integration = (id: IntegrationId): Integration => INTEGRATIONS.find((i) => i.id === id)!;
