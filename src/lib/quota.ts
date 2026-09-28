import { and, count, eq } from "drizzle-orm";
import { db } from "./db";
import { apiUsage } from "./db/schema";
import { getSettings } from "./settings";

export class QuotaExceededError extends Error {}

export const DAILY_QUOTA_MESSAGE = "Cota excedida. Tente novamente amanhã.";

export function isDailyQuotaError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (text === DAILY_QUOTA_MESSAGE) return true;
  return /quota exceeded/i.test(text) && /per day/i.test(text);
}

type Sku = (typeof apiUsage.$inferInsert)["sku"];

// O Google fecha o mês de cobrança no fuso do Pacífico.
export function monthKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

export function usageThisMonth(sku: Sku) {
  const row = db
    .select({ n: count() })
    .from(apiUsage)
    .where(and(eq(apiUsage.sku, sku), eq(apiUsage.monthKey, monthKey())))
    .get();
  return row?.n ?? 0;
}

function record(sku: Sku) {
  db.insert(apiUsage).values({ sku, monthKey: monthKey(), createdAt: new Date() }).run();
}

// Registra antes da chamada: uma falha no meio do caminho nunca deixa uma busca sem contar.
export function reserveTextSearch() {
  const { monthlyLimit } = getSettings();
  const used = usageThisMonth("text_search");
  if (used >= monthlyLimit) {
    throw new QuotaExceededError(
      `Limite mensal de ${monthlyLimit} buscas atingido (${used} usadas). O radar volta a buscar no próximo mês.`,
    );
  }
  record("text_search");
}

export function reserveGeocoding() {
  record("geocoding");
}
