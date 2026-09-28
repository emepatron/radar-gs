import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getCnpjImportedAt } from "./meta";

const TIME_ZONE = "America/Cuiaba";

type ImportJob = {
  state: "running" | "error";
  pid?: number;
  startedAt: number;
  message?: string;
};

export type ImportStatus =
  | { kind: "idle" }
  | { kind: "running"; message: string; percent: number | null; detail: string | null }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

function jobPath() {
  return path.join(process.cwd(), "data", "cnpj-import.json");
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month") };
}

export function monthKeyCuiaba(date = new Date()) {
  const { year, month } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function importBlockedThisMonth(importedAt: number | null, now = new Date()) {
  if (importedAt == null) return false;
  return monthKeyCuiaba(new Date(importedAt)) === monthKeyCuiaba(now);
}

export function nextMonthName(now = new Date()) {
  const { year, month } = zonedParts(now);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(next.year, next.month - 1, 15)),
  );
}

function formatWhen(ms: number) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TIME_ZONE }).format(new Date(ms));
}

function readJob(): ImportJob | null {
  try {
    return JSON.parse(fs.readFileSync(jobPath(), "utf8")) as ImportJob;
  } catch {
    return null;
  }
}

function writeJob(job: ImportJob) {
  fs.mkdirSync(path.dirname(jobPath()), { recursive: true });
  fs.writeFileSync(jobPath(), JSON.stringify(job));
}

export function markImportRunning(pid: number) {
  writeJob({ state: "running", pid, startedAt: Date.now() });
}

export function markImportFinished() {
  fs.rmSync(jobPath(), { force: true });
}

export function markImportFailed(message: string) {
  writeJob({ state: "error", startedAt: Date.now(), message });
}

function readProgress(): { percent: number; detail: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "cnpj-progress.json"), "utf8")) as {
      percent?: number;
      detail?: string;
    };
    if (typeof raw.percent !== "number") return null;
    return {
      percent: Math.max(0, Math.min(100, Math.round(raw.percent))),
      detail: raw.detail ?? "",
    };
  } catch {
    return null;
  }
}

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getImportStatus(now = new Date()): ImportStatus {
  const importedAt = getCnpjImportedAt();
  if (importBlockedThisMonth(importedAt, now) && importedAt != null) {
    return {
      kind: "done",
      message: `Base da Receita atualizada em ${formatWhen(importedAt)}. O próximo download fica para ${nextMonthName(now)}.`,
    };
  }

  const job = readJob();
  if (job?.state === "running" && job.pid != null && pidAlive(job.pid)) {
    const progress = readProgress();
    const percentLabel = progress ? `${progress.percent}%` : null;
    return {
      kind: "running",
      percent: progress?.percent ?? null,
      detail: progress?.detail ?? null,
      message: percentLabel
        ? `Baixando a base da Receita: ${percentLabel}. ${progress?.detail ?? ""}`.trim()
        : "Baixando a base da Receita. Pode levar um tempo. O radar continua usável.",
    };
  }
  if (job?.state === "running") {
    return { kind: "error", message: "O download da Receita parou antes de terminar. Pode tentar de novo." };
  }
  if (job?.state === "error") {
    return { kind: "error", message: job.message || "O download da Receita falhou. Pode tentar de novo." };
  }
  return { kind: "idle" };
}

export function startCnpjImport() {
  const status = getImportStatus();
  if (status.kind === "done" || status.kind === "running") return status;

  const logPath = path.join(process.cwd(), "data", "cnpj-import.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), "scripts/import-cnpj.ts"], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", log, log],
    env: process.env,
  });
  child.unref();
  if (child.pid == null) {
    markImportFailed("Não foi possível iniciar o download da Receita.");
    return getImportStatus();
  }
  markImportRunning(child.pid);
  return getImportStatus();
}
