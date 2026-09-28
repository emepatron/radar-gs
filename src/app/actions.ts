"use server";

import { eq, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { places, searches, segments } from "@/lib/db/schema";
import { crossQualified } from "@/lib/cnpj/apply";
import { startCnpjImport } from "@/lib/cnpj/import-job";
import { enrichSummary } from "@/lib/cnpj/summary";
import { listLeads, parseLeadFilters } from "@/lib/leads";
import { enqueueSearch, rescoreAll, reverifyFailedSites } from "@/lib/radar/scan";
import { FREE_MONTHLY_CAP, saveSettings, type Settings } from "@/lib/settings";
import { exportEnrichedToSheet, exportToSheet } from "@/lib/sheets";

export type ActionResult = { ok: boolean; message: string } | null;

export async function startSearches(formData: FormData) {
  const cityId = Number(formData.get("cityId"));
  const segmentIds = formData.getAll("segmentIds").map(Number).filter(Boolean);
  if (!cityId || segmentIds.length === 0) return;

  for (const segmentId of segmentIds) {
    const created = db
      .insert(searches)
      .values({ cityId, segmentId, status: "queued", createdAt: new Date() })
      .returning({ id: searches.id })
      .get();
    enqueueSearch(created.id);
  }
  revalidatePath("/");
}

export async function toggleOptOut(formData: FormData) {
  const placeId = String(formData.get("placeId"));
  db.update(places).set({ optOut: not(places.optOut) }).where(eq(places.id, placeId)).run();
  revalidatePath("/leads");
}

export async function exportLeads(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const filters = parseLeadFilters((k) => formData.get(k)?.toString());
    const leads = listLeads({ ...filters, showOptOut: false });
    const optedOut = listLeads({ view: filters.view, showOptOut: true }).filter((l) => l.optOut);
    const { added, updated, markedOptOut } =
      filters.view === "enriquecidos" ? await exportEnrichedToSheet(leads, optedOut) : await exportToSheet(leads, optedOut);
    const optOutNote = markedOptOut ? `, ${markedOptOut} marcados como "não contatar"` : "";
    const target = filters.view === "enriquecidos" ? "Aba Enriquecidos atualizada" : "Planilha atualizada";
    return { ok: true, message: `${target}: ${added} novos, ${updated} atualizados${optOutNote}.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function enrichQualified(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const filters = parseLeadFilters((k) => formData.get(k)?.toString());
    const onlySegment = filters.segmentId
      ? (db.select({ name: segments.name }).from(segments).where(eq(segments.id, filters.segmentId)).get()?.name ?? null)
      : null;
    const leads = listLeads({ ...filters, view: "qualificados", showOptOut: false });
    const { confirmed, unconfirmed, skipped } = crossQualified(leads, onlySegment);
    revalidatePath("/leads");
    return { ok: true, message: enrichSummary(confirmed, unconfirmed, skipped) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function downloadCnpjBase(): Promise<ActionResult> {
  const status = startCnpjImport();
  revalidatePath("/leads");
  if (status.kind === "error") return { ok: false, message: status.message };
  if (status.kind === "idle") return { ok: false, message: "Não foi possível iniciar o download da Receita." };
  return { ok: true, message: status.message };
}

export async function reverifySites(_prev: ActionResult): Promise<ActionResult> {
  const total = await reverifyFailedSites();
  const stillFailing = await db.$count(places, eq(places.siteStatus, "error"));
  revalidatePath("/leads");
  return { ok: true, message: `${total} sites reverificados; ${stillFailing} continuam sem resposta.` };
}

export async function updateSettings(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const int = (key: string) => {
    const n = Number(formData.get(key));
    return Number.isInteger(n) && n >= 0 ? n : NaN;
  };
  const value: Settings = {
    weights: {
      noSite: int("noSite"),
      manyReviews: int("manyReviews"),
      noAdsPixel: int("noAdsPixel"),
      whatsapp: int("whatsapp"),
      whatsappInstagram: int("whatsappInstagram"),
    },
    minReviews: int("minReviews"),
    minQualifiedScore: int("minQualifiedScore"),
    monthlyLimit: int("monthlyLimit"),
    maxDepth: int("maxDepth"),
  };

  const numbers = [
    ...Object.values(value.weights),
    value.minReviews,
    value.minQualifiedScore,
    value.monthlyLimit,
    value.maxDepth,
  ];
  if (numbers.some(Number.isNaN)) return { ok: false, message: "Use só números inteiros, sem valores negativos." };
  if (value.monthlyLimit > FREE_MONTHLY_CAP) {
    return { ok: false, message: `O limite mensal não pode passar de ${FREE_MONTHLY_CAP}, a cota gratuita do Google.` };
  }
  if (value.maxDepth > 5) return { ok: false, message: "A profundidade máxima é 5." };

  saveSettings(value);
  rescoreAll();
  revalidatePath("/", "layout");
  return { ok: true, message: "Configurações salvas e pontuações recalculadas." };
}
