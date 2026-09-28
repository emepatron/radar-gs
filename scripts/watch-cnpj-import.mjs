import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tmpDir = path.join(root, "data", "cnpj-tmp");
const progressPath = path.join(root, "data", "cnpj-progress.json");
const jobPath = path.join(root, "data", "cnpj-import.json");

// Tamanhos do mês 2026-09, em bytes (content-length da Receita).
const FILES = [
  ["Estabelecimentos0.zip", 2_243_400_000],
  ["Estabelecimentos1.zip", 341_800_000],
  ["Estabelecimentos2.zip", 336_300_000],
  ["Estabelecimentos3.zip", 368_000_000],
  ["Estabelecimentos4.zip", 340_900_000],
  ["Estabelecimentos5.zip", 335_400_000],
  ["Estabelecimentos6.zip", 369_200_000],
  ["Estabelecimentos7.zip", 339_200_000],
  ["Estabelecimentos8.zip", 340_400_000],
  ["Estabelecimentos9.zip", 366_900_000],
  ["Empresas0.zip", 563_100_000],
  ["Empresas1.zip", 77_900_000],
  ["Empresas2.zip", 79_100_000],
  ["Empresas3.zip", 85_100_000],
  ["Empresas4.zip", 90_200_000],
  ["Empresas5.zip", 97_300_000],
  ["Empresas6.zip", 94_200_000],
  ["Empresas7.zip", 98_700_000],
  ["Empresas8.zip", 98_800_000],
  ["Empresas9.zip", 94_300_000],
];

const total = FILES.reduce((sum, [, size]) => sum + size, 0);

function importAlive() {
  try {
    const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
    if (job?.state !== "running" || job.pid == null) return false;
    process.kill(job.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function currentZip() {
  if (!fs.existsSync(tmpDir)) return null;
  const name = fs.readdirSync(tmpDir).find((file) => file.endsWith(".zip"));
  if (!name) return null;
  const bytes = fs.statSync(path.join(tmpDir, name)).size;
  return { name, bytes };
}

function snapshot() {
  const zip = currentZip();
  const index = zip ? FILES.findIndex(([name]) => name === zip.name) : -1;
  const doneBefore = index > 0 ? FILES.slice(0, index).reduce((sum, [, size]) => sum + size, 0) : 0;
  const current = index >= 0 ? Math.min(zip.bytes, FILES[index][1]) : 0;
  const percent = Math.max(0, Math.min(99, Math.round(((doneBefore + current) / total) * 100)));
  const detail = zip ? zip.name.replace(".zip", "") : "gravando";
  return { percent, detail, done: false };
}

function write(progress) {
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(progress));
}

function bar(percent) {
  const width = 28;
  const filled = Math.round((percent / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(width - filled)}] ${String(percent).padStart(3)}%`;
}

let last = snapshot();
write({ ...last, done: false });
console.log(`${bar(last.percent)} ${last.detail}`);

const timer = setInterval(() => {
  if (!importAlive()) {
    clearInterval(timer);
    const finished = { percent: 100, detail: "concluído", done: true };
    write(finished);
    console.log(`${bar(100)} concluído`);
    console.log("IMPORT_FINISHED");
    return;
  }
  const next = snapshot();
  if (next.percent >= last.percent) last = next;
  write({ ...last, done: false });
  console.log(`${bar(last.percent)} ${last.detail}`);
}, 2000);
