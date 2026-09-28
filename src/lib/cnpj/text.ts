const TRAILING_LEGAL = new Set(["ltda", "me", "epp", "eireli", "ei", "sa", "ss", "mei"]);

export function normalizeName(value: string): string {
  const cleaned = value
    .replace(/\bs\s*\/\s*a\b/gi, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const tokens = cleaned.split(" ").filter(Boolean);
  while (tokens.length > 0 && TRAILING_LEGAL.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(" ");
}

export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function formatCnae(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 7) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}
