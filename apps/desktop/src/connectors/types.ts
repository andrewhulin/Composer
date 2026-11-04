import type { SourceContent, SourcePlatform } from "@composer/core";
import type { SecretKey } from "../platform/secrets";

export interface ConnectorResult {
  title: string;
  content: SourceContent;
  /** Connector settings saved on the node so Sync can fetch again. */
  config: Record<string, string>;
}

/** One platform Composer can pull from directly. Parsing is pure; fetching goes through `http`. */
export interface Connector {
  platform: SourcePlatform;
  label: string;
  /** Keychain item holding the token, when the API needs one. */
  secret?: SecretKey;
  /** Whether a token is required (Are.na and Pinterest boards work without one). */
  tokenRequired: boolean;
  /** Where to get a token, shown in Settings. */
  tokenHelp?: string;
  /** Recognises a pasted URL and returns the config to fetch it. */
  match(url: URL): Record<string, string> | undefined;
  fetch(config: Record<string, string>, token: string | null): Promise<ConnectorResult>;
}
