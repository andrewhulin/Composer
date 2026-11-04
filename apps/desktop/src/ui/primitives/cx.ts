/** Joins truthy class names. */
export function cx(...names: (string | number | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
