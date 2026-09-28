import { normalizeName } from "./text";

export const TARGET_CITIES = ["Lucas do Rio Verde", "Sorriso", "Sinop", "Cuiabá"] as const;

const SITUACAO: Record<string, string> = {
  "01": "Nula",
  "02": "Ativa",
  "03": "Suspensa",
  "04": "Inapta",
  "08": "Baixada",
};

export type Establishment = {
  cnpj: string;
  cnpjBasico: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  cnaePrincipal: string;
  cnaesSecundarios: string[];
  cnaeDescricao: string;
  tipoLogradouro: string;
  logradouro: string;
  numero: string;
  municipio: string;
};

export function canonicalCity(receitaName: string): (typeof TARGET_CITIES)[number] | null {
  const normalized = normalizeName(receitaName);
  return TARGET_CITIES.find((city) => normalizeName(city) === normalized) ?? null;
}

export function municipioCode(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "") || "0";
}

export function createCsvSplitter(onRecord: (cols: string[]) => void) {
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let ended = false;

  const emit = () => {
    record.push(field);
    field = "";
    if (record.some((col) => col.length > 0)) onRecord(record);
    record = [];
  };

  return {
    push(chunk: string) {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i]!;
        if (inQuotes) {
          if (ch === '"') {
            if (chunk[i + 1] === '"') {
              field += '"';
              i++;
            } else inQuotes = false;
          } else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ";") {
          record.push(field);
          field = "";
        } else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && chunk[i + 1] === "\n") i++;
          emit();
        } else field += ch;
      }
    },
    end() {
      if (ended) return;
      ended = true;
      if (field.length > 0 || record.length > 0) emit();
    },
  };
}

export function rowsFromCsv(text: string): string[][] {
  const rows: string[][] = [];
  const splitter = createCsvSplitter((cols) => rows.push(cols));
  splitter.push(text);
  splitter.end();
  return rows;
}

export function buildMunicipioMap(rows: Iterable<string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const cols of rows) {
    const city = canonicalCity(cols[1] ?? "");
    if (!city) continue;
    map.set(municipioCode(cols[0] ?? ""), city);
  }
  return map;
}

export function buildCnaeMap(rows: Iterable<string[]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const cols of rows) {
    const code = (cols[0] ?? "").replace(/\D/g, "");
    if (code) map.set(code, (cols[1] ?? "").trim());
  }
  return map;
}

function padDigits(value: string, size: number) {
  return value.replace(/\D/g, "").padStart(size, "0");
}

export function estabelecimentoFromRow(
  cols: string[],
  municipioByCode: Map<string, string>,
  cnaeByCode: Map<string, string>,
): Establishment | null {
  if (cols.length < 21) return null;
  if ((cols[19] ?? "").trim().toUpperCase() !== "MT") return null;
  const municipio = municipioByCode.get(municipioCode(cols[20] ?? ""));
  if (!municipio) return null;

  const cnpjBasico = padDigits(cols[0] ?? "", 8);
  const cnpj = `${cnpjBasico}${padDigits(cols[1] ?? "", 4)}${padDigits(cols[2] ?? "", 2)}`;
  if (cnpj.length !== 14 || cnpjBasico === "00000000") return null;

  const cnaePrincipal = (cols[11] ?? "").replace(/\D/g, "");
  const cnaesSecundarios = (cols[12] ?? "")
    .split(",")
    .map((code) => code.replace(/\D/g, ""))
    .filter((code) => code.length === 7);
  const situacaoCode = padDigits(cols[5] ?? "", 2);

  return {
    cnpj,
    cnpjBasico,
    razaoSocial: "",
    nomeFantasia: (cols[4] ?? "").trim(),
    situacao: SITUACAO[situacaoCode] ?? situacaoCode,
    cnaePrincipal,
    cnaesSecundarios,
    cnaeDescricao: cnaeByCode.get(cnaePrincipal) ?? "",
    tipoLogradouro: (cols[13] ?? "").trim(),
    logradouro: (cols[14] ?? "").trim(),
    numero: (cols[15] ?? "").trim(),
    municipio,
  };
}

export function razaoFromEmpresaRow(cols: string[]): { basico: string; razao: string } | null {
  const basico = (cols[0] ?? "").replace(/\D/g, "");
  const razao = (cols[1] ?? "").trim();
  if (basico.length === 0 || razao.length === 0) return null;
  return { basico: basico.padStart(8, "0"), razao };
}
