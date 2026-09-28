import type { Establishment } from "./parse";
import { normalizeName } from "./text";

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o"]);
const STREET_PREFIX = /^(?:rua|avenida|av|travessa|tv|alameda|rodovia|rod|estrada|praca|largo|via|viela|r)\s+/;

export type MatchResult =
  | { status: "nao_confirmado" }
  | {
      status: "confirmado";
      assertiveness: 60 | 80 | 100;
      cnpj: string;
      razao: string;
      situacao: string;
      cnae: string;
      cnaeDescricao: string;
      cnaeMatch: "confere" | "diverge" | null;
    };

type AddressRelation = "compativel" | "incomparavel" | "diverge";

export function indexEstablishments(rows: Establishment[]) {
  const exact = new Map<string, Establishment[]>();
  const byToken = new Map<string, Establishment[]>();

  const add = (map: Map<string, Establishment[]>, key: string, est: Establishment) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(est);
    else map.set(key, [est]);
  };

  for (const est of rows) {
    const fantasia = normalizeName(est.nomeFantasia);
    const razao = normalizeName(est.razaoSocial);
    add(exact, fantasia, est);
    if (razao !== fantasia) add(exact, razao, est);
    for (const token of new Set([...significantTokens(fantasia), ...significantTokens(razao)])) {
      add(byToken, token, est);
    }
  }

  return { exact, byToken };
}

export function matchPlace(
  place: { name: string; address: string | null },
  index: ReturnType<typeof indexEstablishments>,
  allowedCnaes: string[],
): MatchResult {
  const name = normalizeName(place.name);
  if (!name) return { status: "nao_confirmado" };

  const kinds = new Map<string, { est: Establishment; kind: "exact" | "similar" }>();
  const remember = (est: Establishment, kind: "exact" | "similar") => {
    const prev = kinds.get(est.cnpj);
    if (!prev || (prev.kind === "similar" && kind === "exact")) kinds.set(est.cnpj, { est, kind });
  };

  for (const est of unique(index.exact.get(name))) remember(est, "exact");

  const seen = new Set<string>();
  for (const token of significantTokens(name)) {
    for (const est of index.byToken.get(token) ?? []) {
      if (seen.has(est.cnpj) || kinds.get(est.cnpj)?.kind === "exact") continue;
      seen.add(est.cnpj);
      if (isSimilar(name, normalizeName(est.nomeFantasia)) || isSimilar(name, normalizeName(est.razaoSocial))) {
        remember(est, "similar");
      }
    }
  }

  const byBasico = new Map<string, { est: Establishment; kind: "exact" | "similar" }[]>();
  for (const item of kinds.values()) {
    const list = byBasico.get(item.est.cnpjBasico) ?? [];
    list.push(item);
    byBasico.set(item.est.cnpjBasico, list);
  }
  if (byBasico.size !== 1) return { status: "nao_confirmado" };

  const group = [...byBasico.values()][0]!;
  const kind = group.some((item) => item.kind === "exact") ? "exact" : "similar";
  const rated = group.map((item) => ({ est: item.est, relation: addressRelation(place.address, item.est) }));

  const compatible = rated.filter((item) => item.relation === "compativel");
  const open = rated.filter((item) => item.relation === "incomparavel");
  let chosen: Establishment;
  let assertiveness: 60 | 80 | 100;

  if (kind === "exact") {
    if (compatible.length > 0) {
      chosen = prefer(compatible.map((item) => item.est));
      assertiveness = 100;
    } else if (open.length > 0) {
      chosen = prefer(open.map((item) => item.est));
      assertiveness = 80;
    } else return { status: "nao_confirmado" };
  } else {
    const usable = rated.filter((item) => item.relation !== "diverge");
    if (usable.length === 0) return { status: "nao_confirmado" };
    const best = usable.filter((item) => item.relation === "compativel");
    chosen = prefer((best.length > 0 ? best : usable).map((item) => item.est));
    assertiveness = 60;
  }

  const codes = new Set([chosen.cnaePrincipal, ...chosen.cnaesSecundarios]);
  return {
    status: "confirmado",
    assertiveness,
    cnpj: chosen.cnpj,
    razao: chosen.razaoSocial,
    situacao: chosen.situacao,
    cnae: chosen.cnaePrincipal,
    cnaeDescricao: chosen.cnaeDescricao,
    cnaeMatch:
      allowedCnaes.length === 0 ? null : allowedCnaes.some((code) => codes.has(code)) ? "confere" : "diverge",
  };
}

function significantTokens(name: string) {
  return name.split(" ").filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function isSimilar(a: string, b: string) {
  if (!a || !b || a === b) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // "clinica" sozinha casaria com qualquer nome. Exige um nome curto de verdade.
  if (shorter.length < 8) return false;
  if (shorter.split(" ").length < 2 && shorter.length < 12) return false;
  return longer.startsWith(`${shorter} `) || longer.endsWith(` ${shorter}`) || longer.includes(` ${shorter} `);
}

function unique(list: Establishment[] | undefined) {
  if (!list) return [];
  const seen = new Set<string>();
  return list.filter((est) => {
    if (seen.has(est.cnpj)) return false;
    seen.add(est.cnpj);
    return true;
  });
}

function prefer(list: Establishment[]) {
  return [...list].sort((a, b) => rank(b) - rank(a))[0]!;
}

function rank(est: Establishment) {
  return (est.situacao === "Ativa" ? 2 : 0) + (est.cnpj.slice(8, 12) === "0001" ? 1 : 0);
}

function addressRelation(address: string | null, est: Establishment): AddressRelation {
  const google = googleStreet(address);
  const receita = receitaStreet(est);
  if (!google || !receita) return "incomparavel";
  if (google.street !== receita.street) return "diverge";
  if (google.number && receita.number && google.number !== receita.number) return "diverge";
  return "compativel";
}

function googleStreet(address: string | null) {
  if (!address) return null;
  const first = address.split(",")[0] ?? "";
  const normalized = normalizeName(first);
  if (!STREET_PREFIX.test(normalized)) return null;
  const street = streetCore(first);
  if (street.length < 3) return null;
  return { street, number: leadingNumber(address.split(",")[1] ?? "") };
}

function receitaStreet(est: Establishment) {
  if (!est.logradouro.trim()) return null;
  const street = streetCore(`${est.tipoLogradouro} ${est.logradouro}`);
  if (street.length < 3) return null;
  return { street, number: leadingNumber(est.numero) };
}

function streetCore(value: string) {
  return normalizeName(value).replace(STREET_PREFIX, "");
}

function leadingNumber(value: string) {
  const match = value.match(/\d+/);
  if (!match) return null;
  return match[0].replace(/^0+/, "") || "0";
}
