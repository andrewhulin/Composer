import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

/** Keychain items the app uses. Values never leave Keychain except into memory for a request. */
export const SECRET = {
  anthropic: "anthropic_api_key",
  linear: "linear_api_key",
  figma: "figma_token",
  arena: "arena_token",
  slack: "slack_token",
  statsig: "statsig_console_key",
  notion: "notion_token",
} as const;

export type SecretKey = (typeof SECRET)[keyof typeof SECRET];

// The browser preview keeps secrets in sessionStorage so they vanish with the tab.
export async function getSecret(key: SecretKey): Promise<string | null> {
  if (inTauri()) return invoke<string | null>("secret_get", { key });
  return sessionStorage.getItem(`secret.${key}`);
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  if (inTauri()) return invoke("secret_set", { key, value });
  sessionStorage.setItem(`secret.${key}`, value);
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  if (inTauri()) return invoke("secret_delete", { key });
  sessionStorage.removeItem(`secret.${key}`);
}
