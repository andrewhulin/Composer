import type { SourcePlatform } from "@composer/core";
import { getSecret } from "../platform/secrets";
import { arena } from "./arena";
import { figma } from "./figma";
import { linear } from "./linear";
import { pinterest } from "./pinterest";
import { slack } from "./slack";
import type { Connector, ConnectorResult } from "./types";

export const CONNECTORS: Connector[] = [linear, figma, arena, pinterest, slack];

export function connectorFor(platform: SourcePlatform): Connector | undefined {
  return CONNECTORS.find((c) => c.platform === platform);
}

/** The connector that understands this link, with the config it parsed out of it. */
export function matchUrl(raw: string): { connector: Connector; config: Record<string, string> } | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return;
  }
  for (const connector of CONNECTORS) {
    const config = connector.match(url);
    if (config) return { connector, config };
  }
}

export async function runConnector(connector: Connector, config: Record<string, string>): Promise<ConnectorResult> {
  const token = connector.secret ? await getSecret(connector.secret) : null;
  return connector.fetch(config, token);
}

export type { Connector, ConnectorResult };
