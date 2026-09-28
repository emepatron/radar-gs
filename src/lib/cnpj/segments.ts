export function cnaeCodes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,;]+/)
        .map((part) => part.replace(/\D/g, ""))
        .filter((code) => code.length === 7),
    ),
  ];
}

export function cnaesForSegmentNames(rows: { name: string; cnaes: string }[], names: string[]): string[] {
  const wanted = new Set(names);
  return [...new Set(rows.filter((row) => wanted.has(row.name)).flatMap((row) => cnaeCodes(row.cnaes)))];
}
