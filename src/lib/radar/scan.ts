import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { cities, placeSearches, places, searches, segments, type Place } from "../db/schema";
import { geocodeCity } from "../google/geocode";
import { searchText, type ApiPlace, type Rect } from "../google/places";
import { DAILY_QUOTA_MESSAGE, isDailyQuotaError, QuotaExceededError } from "../quota";
import { getSettings, type Settings } from "../settings";
import { enrichPlace } from "./enrich";
import { searchQueries } from "./queries";
import { scorePlace } from "./score";

const MAX_PAGES = 3;
const RESULTS_WHEN_SATURATED = 60;
const ENRICH_CONCURRENCY = 4;
const ENRICH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const globalForQueue = globalThis as unknown as { radarQueue?: Promise<void> };

// Uma busca por vez: evita que duas buscas paralelas passem juntas pelo limite mensal.
export function enqueueSearch(searchId: number) {
  globalForQueue.radarQueue = (globalForQueue.radarQueue ?? Promise.resolve()).then(() => runSearch(searchId));
}

async function runSearch(searchId: number) {
  const search = db.select().from(searches).where(eq(searches.id, searchId)).get();
  if (!search || search.status !== "queued") return;
  db.update(searches).set({ status: "running" }).where(eq(searches.id, searchId)).run();

  try {
    const city = db.select().from(cities).where(eq(cities.id, search.cityId)).get()!;
    const segment = db.select().from(segments).where(eq(segments.id, search.segmentId)).get()!;
    const settings = getSettings();
    const rect = await ensureCityRect(city);
    const found = new Set<string>();

    let status: "done" | "quota" = "done";
    let error: string | null = null;
    try {
      for (const phrase of searchQueries(segment.query)) {
        await scanRect(rect, 0, {
          searchId,
          cityId: city.id,
          query: `${phrase} em ${city.name}`,
          maxDepth: settings.maxDepth,
          found,
        });
      }
    } catch (e) {
      if (!(e instanceof QuotaExceededError)) throw e;
      status = "quota";
      error = e.message;
    }

    await enrichAndScore([...found], settings);

    db.update(searches)
      .set({ status, error, placesFound: found.size, finishedAt: new Date() })
      .where(eq(searches.id, searchId))
      .run();
  } catch (e) {
    db.update(searches)
      .set({
        status: "error",
        error: isDailyQuotaError(e) ? DAILY_QUOTA_MESSAGE : e instanceof Error ? e.message : String(e),
        finishedAt: new Date(),
      })
      .where(eq(searches.id, searchId))
      .run();
  }
}

async function ensureCityRect(city: typeof cities.$inferSelect): Promise<Rect> {
  if (city.lowLat != null && city.lowLng != null && city.highLat != null && city.highLng != null) {
    return {
      low: { latitude: city.lowLat, longitude: city.lowLng },
      high: { latitude: city.highLat, longitude: city.highLng },
    };
  }
  const rect = await geocodeCity(city.name, city.uf);
  db.update(cities)
    .set({
      lowLat: rect.low.latitude,
      lowLng: rect.low.longitude,
      highLat: rect.high.latitude,
      highLng: rect.high.longitude,
    })
    .where(eq(cities.id, city.id))
    .run();
  return rect;
}

type ScanContext = { searchId: number; cityId: number; query: string; maxDepth: number; found: Set<string> };

async function scanRect(rect: Rect, depth: number, ctx: ScanContext) {
  let total = 0;
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (pageToken) await sleep(500);
    const result = await searchText(ctx.query, rect, pageToken);
    db.update(searches)
      .set({ requestsUsed: sql`${searches.requestsUsed} + 1` })
      .where(eq(searches.id, ctx.searchId))
      .run();

    for (const p of result.places) {
      upsertPlace(p, ctx.cityId, ctx.searchId);
      ctx.found.add(p.id);
    }
    total += result.places.length;
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  // 60 resultados é o teto da API: a área pode ter mais negócios, então divide em 4 e busca de novo.
  if (total >= RESULTS_WHEN_SATURATED && depth < ctx.maxDepth) {
    for (const quadrant of splitRect(rect)) {
      await scanRect(quadrant, depth + 1, ctx);
    }
  }
}

function splitRect({ low, high }: Rect): Rect[] {
  const midLat = (low.latitude + high.latitude) / 2;
  const midLng = (low.longitude + high.longitude) / 2;
  return [
    { low, high: { latitude: midLat, longitude: midLng } },
    { low: { latitude: low.latitude, longitude: midLng }, high: { latitude: midLat, longitude: high.longitude } },
    { low: { latitude: midLat, longitude: low.longitude }, high: { latitude: high.latitude, longitude: midLng } },
    { low: { latitude: midLat, longitude: midLng }, high },
  ];
}

function upsertPlace(p: ApiPlace, cityId: number, searchId: number) {
  const now = new Date();
  const googleFields = {
    name: p.displayName?.text ?? "(sem nome)",
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    primaryType: p.primaryType ?? null,
    types: p.types ?? [],
    businessStatus: p.businessStatus ?? null,
    mapsUri: p.googleMapsUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    intlPhone: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    updatedAt: now,
  };

  db.insert(places)
    .values({ id: p.id, cityId, createdAt: now, ...googleFields })
    .onConflictDoUpdate({ target: places.id, set: googleFields })
    .run();
  db.insert(placeSearches).values({ placeId: p.id, searchId }).onConflictDoNothing().run();
}

export async function reverifyFailedSites() {
  const failed = db.select({ id: places.id }).from(places).where(eq(places.siteStatus, "error")).all();
  await enrichAndScore(
    failed.map((p) => p.id),
    getSettings(),
  );
  return failed.length;
}

async function enrichAndScore(placeIds: string[], settings: Settings) {
  if (placeIds.length === 0) return;
  const rows = db.select().from(places).where(inArray(places.id, placeIds)).all();
  const now = Date.now();
  const pending = rows.filter(
    (p) =>
      !p.enrichedAt ||
      now - p.enrichedAt.getTime() > ENRICH_MAX_AGE_MS ||
      p.siteStatus === "pending" ||
      p.siteStatus === "error",
  );

  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const place = pending[next++];
      const enrichment = await enrichPlace(place.website, place.phone);
      db.update(places)
        .set({ ...enrichment, enrichedAt: new Date() })
        .where(eq(places.id, place.id))
        .run();
    }
  };
  await Promise.all(Array.from({ length: ENRICH_CONCURRENCY }, worker));

  rescore(db.select().from(places).where(inArray(places.id, placeIds)).all(), settings);
}

export function rescore(rows: Place[], settings: Settings) {
  for (const p of rows) {
    const { score, signals } = scorePlace(p, settings);
    db.update(places).set({ score, signals }).where(eq(places.id, p.id)).run();
  }
}

export function rescoreAll() {
  rescore(db.select().from(places).all(), getSettings());
}
