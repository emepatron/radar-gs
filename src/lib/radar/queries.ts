export function searchQueries(query: string): string[] {
  const parts = query
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [query.trim()];
}
