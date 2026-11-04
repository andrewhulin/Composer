/** Reads a string field out of JSON that is still streaming in, e.g. `"statement": "Returning us…`. */
export function partialField(json: string, key: string): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(json);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]!.replace(/\\$/, "")}"`) as string;
  } catch {
    return m[1];
  }
}

/** How many times a key has appeared so far, e.g. insights drafted while streaming. */
export function countKey(json: string, key: string): number {
  return (json.match(new RegExp(`"${key}"\\s*:`, "g")) ?? []).length;
}
