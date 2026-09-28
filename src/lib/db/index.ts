import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

// Nome oficial do município e a sigla do estado. Entram na primeira execução.
// Cidade que já existe no banco não é alterada nem apagada.
const SEED_CITIES: { name: string; uf: string }[] = [
  // { name: "Nome do município", uf: "UF" },
];

const SEED_SEGMENTS = [
  { name: "Advocacia", query: "escritório de advocacia" },
  { name: "Clínica de estética facial", query: "clínica de estética facial" },
  { name: "Clínica odontológica", query: "clínica odontológica" },
  { name: "Academia", query: "academia de ginástica; academia de musculação" },
];

function createDb() {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(path.join(dataDir, "radar.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  if (SEED_CITIES.length > 0) db.insert(schema.cities).values(SEED_CITIES).onConflictDoNothing().run();
  db.insert(schema.segments).values(SEED_SEGMENTS).onConflictDoNothing().run();

  // A fila vive na memória do processo: buscas pendentes de uma execução anterior não vão continuar.
  db.update(schema.searches)
    .set({ status: "interrupted", finishedAt: new Date() })
    .where(inArray(schema.searches.status, ["queued", "running"]))
    .run();

  return db;
}

const globalForDb = globalThis as unknown as { radarDb?: ReturnType<typeof createDb> };

export const db = globalForDb.radarDb ?? (globalForDb.radarDb = createDb());
