import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { db } from "../src/lib/db";
import { markImportFailed, markImportFinished, markImportRunning } from "../src/lib/cnpj/import-job";
import { setCnpjImportedAt } from "../src/lib/cnpj/meta";
import {
  buildCnaeMap,
  buildMunicipioMap,
  createCsvSplitter,
  estabelecimentoFromRow,
  razaoFromEmpresaRow,
  rowsFromCsv,
  type Establishment,
} from "../src/lib/cnpj/parse";

// Token público do compartilhamento de dados abertos da Receita. Não é credencial do projeto.
const SHARE_TOKEN = "gn672Ad4CF8N6TK";
const WEBDAV = "https://arquivos.receitafederal.gov.br/public.php/webdav";
const MIN_ROWS = 1000;

const sqlite = db.$client;
const tmpDir = path.join(process.cwd(), "data", "cnpj-tmp");

const insertSql = `insert into cnpj_import_staging (
  cnpj, cnpj_basico, razao_social, nome_fantasia, situacao, cnae_principal, cnaes_secundarios,
  cnae_descricao, tipo_logradouro, logradouro, numero, municipio
) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

async function main() {
  markImportRunning(process.pid);
  const fixture = process.argv.find((arg) => arg.startsWith("--fixture="))?.slice("--fixture=".length);
  sqlite.exec("drop table if exists cnpj_import_staging");
  sqlite.exec(`create table cnpj_import_staging (
    cnpj text primary key not null,
    cnpj_basico text not null,
    razao_social text not null default '',
    nome_fantasia text not null default '',
    situacao text not null,
    cnae_principal text not null,
    cnaes_secundarios text not null default '',
    cnae_descricao text not null default '',
    tipo_logradouro text not null default '',
    logradouro text not null default '',
    numero text not null default '',
    municipio text not null
  )`);
  sqlite.exec("create index cnpj_import_staging_basico on cnpj_import_staging (cnpj_basico)");

  try {
    if (fixture) await importFixture(fixture);
    else await importLatestMonth();
    const kept = sqlite.prepare("select count(*) as n from cnpj_import_staging").get() as { n: number };
    if (kept.n < MIN_ROWS) {
      throw new Error(
        `A importação ficou com ${kept.n} estabelecimentos. A base atual foi mantida. Confira o mês da Receita e as quatro cidades.`,
      );
    }
    const swap = sqlite.transaction(() => {
      sqlite.exec("delete from cnpj_establishments");
      sqlite.exec("insert into cnpj_establishments select * from cnpj_import_staging");
      sqlite.exec("drop table cnpj_import_staging");
    });
    swap();
    setCnpjImportedAt(Date.now());
    markImportFinished();
    const byCity = sqlite.prepare("select municipio, count(*) as n from cnpj_establishments group by municipio").all() as {
      municipio: string;
      n: number;
    }[];
    console.log(`Base gravada: ${kept.n} estabelecimentos.`);
    for (const row of byCity) console.log(`  ${row.municipio}: ${row.n}`);
  } catch (error) {
    sqlite.exec("drop table if exists cnpj_import_staging");
    throw error;
  }
}

async function importFixture(dir: string) {
  const read = async (name: string) => rowsFromCsv(await fs.readFile(path.join(dir, name), "latin1"));
  const municipioByCode = buildMunicipioMap(await read("municipios.csv"));
  const cnaeByCode = buildCnaeMap(await read("cnaes.csv"));
  const insert = sqlite.prepare(insertSql);
  const write = sqlite.transaction((rows: Establishment[]) => {
    for (const row of rows) insert.run(...toParams(row));
  });
  write(rowsFromCsv(await fs.readFile(path.join(dir, "estabelecimentos.csv"), "latin1")).flatMap((cols) => {
    const row = estabelecimentoFromRow(cols, municipioByCode, cnaeByCode);
    return row ? [row] : [];
  }));
  applyRazoes(rowsFromCsv(await fs.readFile(path.join(dir, "empresas.csv"), "latin1")));
}

async function importLatestMonth() {
  await fs.mkdir(tmpDir, { recursive: true });
  const month = await latestMonth();
  console.log(`Mês da Receita: ${month}`);
  const municipioByCode = buildMunicipioMap(await readZip(month, "Municipios.zip"));
  const cnaeByCode = buildCnaeMap(await readZip(month, "Cnaes.zip"));
  if (municipioByCode.size !== 4) {
    throw new Error("Não encontrei as quatro cidades na tabela de municípios da Receita.");
  }

  const insert = sqlite.prepare(insertSql);
  let kept = 0;
  const write = sqlite.transaction((rows: Establishment[]) => {
    for (const row of rows) insert.run(...toParams(row));
  });

  for (let part = 0; part < 10; part++) {
    const file = `Estabelecimentos${part}.zip`;
    console.log(`Lendo ${file}`);
    const batch: Establishment[] = [];
    await forEachZipRecord(month, file, (cols) => {
      const row = estabelecimentoFromRow(cols, municipioByCode, cnaeByCode);
      if (!row) return;
      batch.push(row);
      if (batch.length >= 500) {
        write(batch.splice(0, batch.length));
      }
    });
    if (batch.length > 0) write(batch.splice(0, batch.length));
    kept = (sqlite.prepare("select count(*) as n from cnpj_import_staging").get() as { n: number }).n;
    console.log(`  acumulado nas quatro cidades: ${kept}`);
  }

  const known = new Set(
    (sqlite.prepare("select distinct cnpj_basico as basico from cnpj_import_staging").all() as { basico: string }[]).map(
      (row) => row.basico,
    ),
  );
  const update = sqlite.prepare("update cnpj_import_staging set razao_social = ? where cnpj_basico = ?");
  const updateMany = sqlite.transaction((pairs: { basico: string; razao: string }[]) => {
    for (const pair of pairs) update.run(pair.razao, pair.basico);
  });
  for (let part = 0; part < 10; part++) {
    const file = `Empresas${part}.zip`;
    console.log(`Lendo ${file}`);
    const batch: { basico: string; razao: string }[] = [];
    await forEachZipRecord(month, file, (cols) => {
      const row = razaoFromEmpresaRow(cols);
      if (!row || !known.has(row.basico)) return;
      batch.push(row);
      if (batch.length >= 500) updateMany(batch.splice(0, batch.length));
    });
    if (batch.length > 0) updateMany(batch.splice(0, batch.length));
  }
}

function applyRazoes(rows: string[][]) {
  const update = sqlite.prepare("update cnpj_import_staging set razao_social = ? where cnpj_basico = ?");
  const updateMany = sqlite.transaction((pairs: { basico: string; razao: string }[]) => {
    for (const pair of pairs) update.run(pair.razao, pair.basico);
  });
  updateMany(rows.flatMap((cols) => {
    const row = razaoFromEmpresaRow(cols);
    return row ? [row] : [];
  }));
}

function toParams(row: Establishment) {
  return [
    row.cnpj,
    row.cnpjBasico,
    row.razaoSocial,
    row.nomeFantasia,
    row.situacao,
    row.cnaePrincipal,
    row.cnaesSecundarios.join(","),
    row.cnaeDescricao,
    row.tipoLogradouro,
    row.logradouro,
    row.numero,
    row.municipio,
  ];
}

async function latestMonth() {
  const xml = await propfind("/Dados/Cadastros/CNPJ/");
  const months = [...xml.matchAll(/CNPJ\/(\d{4}-\d{2})\//g)].map((match) => match[1]!);
  months.sort();
  const latest = months.at(-1);
  if (!latest) throw new Error("Não encontrei a pasta mensal dos dados abertos da Receita.");
  return latest;
}

async function readZip(month: string, file: string) {
  const rows: string[][] = [];
  await forEachZipRecord(month, file, (cols) => rows.push(cols));
  return rows;
}

async function forEachZipRecord(month: string, file: string, onRecord: (cols: string[]) => void) {
  const dest = path.join(tmpDir, file);
  await download(`/Dados/Cadastros/CNPJ/${month}/${file}`, dest);
  try {
    await streamZip(dest, onRecord);
  } finally {
    await fs.rm(dest, { force: true });
  }
}

async function download(remotePath: string, dest: string) {
  const response = await fetch(`${WEBDAV}${remotePath}`, { headers: { Authorization: basicAuth() } });
  if (!response.ok || !response.body) {
    throw new Error(`A Receita respondeu ${response.status} ao baixar ${path.basename(remotePath)}.`);
  }
  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), createWriteStream(dest));
}

async function propfind(remotePath: string) {
  const response = await fetch(`${WEBDAV}${remotePath}`, {
    method: "PROPFIND",
    headers: { Authorization: basicAuth(), Depth: "1" },
  });
  if (!response.ok) throw new Error(`A Receita respondeu ${response.status} ao listar os dados abertos.`);
  return response.text();
}

function basicAuth() {
  return `Basic ${Buffer.from(`${SHARE_TOKEN}:`).toString("base64")}`;
}

function streamZip(zipPath: string, onRecord: (cols: string[]) => void) {
  const child = spawn("unzip", ["-p", zipPath], { stdio: ["ignore", "pipe", "pipe"] });
  const splitter = createCsvSplitter(onRecord);
  child.stdout.setEncoding("latin1");
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  return new Promise<void>((resolve, reject) => {
    let stdoutEnded = false;
    let exitCode: number | null = null;
    const finish = () => {
      if (!stdoutEnded || exitCode === null) return;
      if (exitCode === 0) resolve();
      else reject(new Error(`unzip falhou em ${path.basename(zipPath)}: ${stderr.slice(0, 300)}`));
    };
    child.on("error", reject);
    child.stdout.on("data", (chunk: string) => splitter.push(chunk));
    child.stdout.on("end", () => {
      splitter.end();
      stdoutEnded = true;
      finish();
    });
    child.on("close", (code) => {
      exitCode = code ?? 1;
      finish();
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  markImportFailed(message);
  console.error(message);
  process.exitCode = 1;
});
