/* Joins class fragments, dropping falsy ones — enough until we need
 * conflict resolution (tailwind-merge), which we don't yet. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
