import { sha256 } from "./sha256";

/**
 * Canonical JSON: object keys sorted, `undefined` fields dropped, no whitespace.
 * Two values that mean the same thing always serialize to the same bytes, so they hash the same.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite number in canonical JSON");
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalize(v)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalize(v);
  }
  return out;
}

export type Hash = string;

/** Content address of any JSON value. */
export function hashOf(value: unknown): Hash {
  return sha256(canonicalJson(value));
}

/** Hash of several parts, for composite keys. Order matters. */
export function hashParts(...parts: unknown[]): Hash {
  return hashOf(parts);
}
