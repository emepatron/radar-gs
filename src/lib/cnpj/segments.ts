export const SEGMENT_CNAES: Record<string, readonly string[]> = {
  Advocacia: ["6911701"],
  "Clínica de estética facial": ["9602502"],
  "Clínica odontológica": ["8630504"],
  Academia: ["9313100"],
};

export function cnaesForSegmentNames(names: string[]): string[] {
  return [...new Set(names.flatMap((name) => SEGMENT_CNAES[name] ?? []))];
}
