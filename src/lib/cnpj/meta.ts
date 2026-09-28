import { eq } from "drizzle-orm";
import { db } from "../db";
import { settings } from "../db/schema";

const KEY = "cnpj_imported_at";

export function getCnpjImportedAt(): number | null {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  return typeof row?.value === "number" ? row.value : null;
}

export function setCnpjImportedAt(ms: number) {
  db.insert(settings)
    .values({ key: KEY, value: ms })
    .onConflictDoUpdate({ target: settings.key, set: { value: ms } })
    .run();
}
