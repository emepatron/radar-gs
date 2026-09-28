import { JWT } from "google-auth-library";
import { formatCnae, formatCnpj } from "./cnpj/text";
import { requireEnv } from "./env";
import type { Lead } from "./leads";

const TAB = "Leads";
const HEADER = [
  "place_id",
  "Nome",
  "Pontuação",
  "Sinais",
  "Telefone",
  "WhatsApp",
  "Instagram",
  "E-mails",
  "Site",
  "Avaliações",
  "Nota",
  "Endereço",
  "Cidade",
  "Segmentos",
  "Google Maps",
  "Atualizado em",
];
const LAST_COL = String.fromCharCode("A".charCodeAt(0) + HEADER.length - 1);

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const sheetId = requireEnv("RADAR_SHEET_ID");
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Google Sheets respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function getToken() {
  const creds = JSON.parse(requireEnv("GOOGLE_SHEETS_SA_JSON")) as { client_email: string; private_key: string };
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Não foi possível autenticar a conta de serviço do Google Sheets.");
  return token;
}

function toRow(l: Lead) {
  return [
    l.id,
    l.name,
    l.score,
    l.optOut ? "NÃO CONTATAR (descadastrado)" : l.signals.join(" · "),
    l.phone ?? "",
    l.whatsapp ?? "",
    l.instagram ?? "",
    l.emails.join(", "),
    l.website ?? "",
    l.ratingCount ?? "",
    l.rating ?? "",
    l.address ?? "",
    l.cityName,
    l.segmentNames,
    l.mapsUri ?? "",
    new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" }),
  ];
}

// Atualiza só as colunas do radar (A até P) e casa as linhas pelo place_id; colunas extras da planilha ficam intactas.
export async function exportToSheet(leads: Lead[], optedOut: Lead[]) {
  const token = await getToken();

  const meta = (await sheetsFetch(token, "?fields=sheets.properties.title")) as {
    sheets: { properties: { title: string } }[];
  };
  if (!meta.sheets.some((s) => s.properties.title === TAB)) {
    await sheetsFetch(token, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
    });
  }

  const colA = (await sheetsFetch(token, `/values/${encodeURIComponent(`${TAB}!A:A`)}`)) as { values?: string[][] };
  const rowById = new Map<string, number>();
  (colA.values ?? []).forEach((v, i) => {
    if (i > 0 && v[0]) rowById.set(v[0], i + 1);
  });
  let nextRow = Math.max(colA.values?.length ?? 0, 1) + 1;

  const data: { range: string; values: (string | number)[][] }[] = [
    { range: `${TAB}!A1:${LAST_COL}1`, values: [HEADER] },
  ];
  let added = 0;
  let updated = 0;

  for (const lead of leads) {
    const existing = rowById.get(lead.id);
    const row = existing ?? nextRow++;
    if (existing) updated++;
    else added++;
    data.push({ range: `${TAB}!A${row}:${LAST_COL}${row}`, values: [toRow(lead)] });
  }
  let markedOptOut = 0;
  for (const lead of optedOut) {
    const existing = rowById.get(lead.id);
    if (!existing) continue;
    markedOptOut++;
    data.push({ range: `${TAB}!A${existing}:${LAST_COL}${existing}`, values: [toRow(lead)] });
  }

  await sheetsFetch(token, "/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });

  return { added, updated, markedOptOut };
}

const ENRICHED_TAB = "Enriquecidos";
const ENRICHED_HEADER = [
  "place_id",
  "Nome",
  "Pontuação",
  "Taxa",
  "CNPJ",
  "Razão social",
  "Situação",
  "CNAE",
  "Conferência do CNAE",
  "Telefone",
  "WhatsApp",
  "Cidade",
  "Segmentos",
  "Google Maps",
  "Observação",
];

function toEnrichedRow(lead: Lead, optedOut = false) {
  return [
    lead.id,
    lead.name,
    lead.score,
    lead.cnpjAssertiveness != null ? `${lead.cnpjAssertiveness}%` : "",
    lead.cnpj ? formatCnpj(lead.cnpj) : "",
    lead.cnpjRazao ?? "",
    lead.cnpjSituacao ?? "",
    [lead.cnpjCnae ? formatCnae(lead.cnpjCnae) : "", lead.cnpjCnaeDescricao ?? ""].filter(Boolean).join(" "),
    lead.cnaeMatch === "confere" ? "CNAE confere" : lead.cnaeMatch === "diverge" ? "CNAE diverge" : "",
    lead.phone ?? "",
    lead.whatsapp ?? "",
    lead.cityName,
    lead.segmentNames,
    lead.mapsUri ?? "",
    optedOut ? "NÃO CONTATAR (descadastrado)" : "",
  ];
}

export async function exportEnrichedToSheet(leads: Lead[], optedOut: Lead[]) {
  const token = await getToken();
  const lastCol = String.fromCharCode("A".charCodeAt(0) + ENRICHED_HEADER.length - 1);
  const meta = (await sheetsFetch(token, "?fields=sheets.properties.title")) as {
    sheets: { properties: { title: string } }[];
  };
  if (!meta.sheets.some((sheet) => sheet.properties.title === ENRICHED_TAB)) {
    await sheetsFetch(token, ":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: ENRICHED_TAB } } }] }),
    });
  }

  const colA = (await sheetsFetch(token, `/values/${encodeURIComponent(`${ENRICHED_TAB}!A:A`)}`)) as {
    values?: string[][];
  };
  const rowById = new Map<string, number>();
  (colA.values ?? []).forEach((value, index) => {
    if (index > 0 && value[0]) rowById.set(value[0], index + 1);
  });
  let nextRow = Math.max(colA.values?.length ?? 0, 1) + 1;
  const data: { range: string; values: (string | number)[][] }[] = [
    { range: `${ENRICHED_TAB}!A1:${lastCol}1`, values: [ENRICHED_HEADER] },
  ];
  let added = 0;
  let updated = 0;

  for (const lead of leads) {
    const existing = rowById.get(lead.id);
    const row = existing ?? nextRow++;
    if (existing) updated++;
    else added++;
    data.push({ range: `${ENRICHED_TAB}!A${row}:${lastCol}${row}`, values: [toEnrichedRow(lead)] });
  }
  let markedOptOut = 0;
  for (const lead of optedOut) {
    const existing = rowById.get(lead.id);
    if (!existing) continue;
    markedOptOut++;
    data.push({ range: `${ENRICHED_TAB}!A${existing}:${lastCol}${existing}`, values: [toEnrichedRow(lead, true)] });
  }

  await sheetsFetch(token, "/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });

  return { added, updated, markedOptOut };
}
