import { and, desc, eq, gte, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "./db";
import { cities, places } from "./db/schema";
import { isPublicBody } from "./radar/score";
import { getSettings } from "./settings";

export type LeadView = "qualificados" | "todos" | "enriquecidos";

export type LeadFilters = {
  view: LeadView;
  cityId?: number;
  segmentId?: number;
  minScore?: number;
  showOptOut?: boolean;
};

export function parseLeadFilters(get: (key: string) => string | null | undefined): LeadFilters {
  const num = (key: string) => {
    const n = Number(get(key));
    return get(key) && Number.isFinite(n) ? n : undefined;
  };
  return {
    view: get("ver") === "todos" ? "todos" : get("ver") === "enriquecidos" ? "enriquecidos" : "qualificados",
    cityId: num("cidade"),
    segmentId: num("segmento"),
    minScore: num("min"),
    showOptOut: get("optout") === "1",
  };
}

export function listLeads(f: LeadFilters) {
  const conditions: SQL[] = [
    or(isNull(places.businessStatus), eq(places.businessStatus, "OPERATIONAL"))!,
  ];
  if (!f.showOptOut) conditions.push(eq(places.optOut, false));
  if (f.cityId) conditions.push(eq(places.cityId, f.cityId));
  if (f.view === "qualificados") conditions.push(gte(places.score, getSettings().minQualifiedScore));
  if (f.view === "enriquecidos") conditions.push(eq(places.cnpjStatus, "confirmado"));
  if (f.minScore) conditions.push(gte(places.score, f.minScore));
  if (f.segmentId) {
    conditions.push(sql`exists (
      select 1 from place_searches ps join searches s on s.id = ps.search_id
      where ps.place_id = ${places.id} and s.segment_id = ${f.segmentId}
    )`);
  }

  const rows = db
    .select({
      place: places,
      cityName: cities.name,
      segmentNames: sql<string | null>`(
        select group_concat(distinct sg.name) from place_searches ps
        join searches s on s.id = ps.search_id
        join segments sg on sg.id = s.segment_id
        where ps.place_id = ${places.id}
      )`,
    })
    .from(places)
    .innerJoin(cities, eq(cities.id, places.cityId))
    .where(and(...conditions))
    .orderBy(desc(places.score), desc(places.ratingCount))
    .all()
    .filter((r) => !isPublicBody(r.place))
    .map((r) => ({ ...r.place, cityName: r.cityName, segmentNames: (r.segmentNames ?? "").split(",").join(", ") }));

  if (f.view === "enriquecidos") {
    rows.sort(
      (a, b) =>
        (b.cnpjAssertiveness ?? 0) - (a.cnpjAssertiveness ?? 0) ||
        b.score - a.score ||
        (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
    );
  }
  return rows;
}

export type Lead = ReturnType<typeof listLeads>[number];
