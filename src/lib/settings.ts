import { eq } from "drizzle-orm";
import { db } from "./db";
import { settings } from "./db/schema";

export type Weights = {
  noSite: number;
  manyReviews: number;
  noAdsPixel: number;
  whatsapp: number;
  whatsappInstagram: number;
};

export type Settings = {
  weights: Weights;
  minReviews: number;
  minQualifiedScore: number;
  monthlyLimit: number;
  maxDepth: number;
};

export const FREE_MONTHLY_CAP = 1000;

export const DEFAULT_SETTINGS: Settings = {
  weights: { noSite: 30, manyReviews: 25, noAdsPixel: 20, whatsapp: 10, whatsappInstagram: 20 },
  minReviews: 40,
  minQualifiedScore: 40,
  monthlyLimit: 950,
  maxDepth: 3,
};

const KEY = "radar";

export function getSettings(): Settings {
  const row = db.select().from(settings).where(eq(settings.key, KEY)).get();
  const saved = (row?.value ?? {}) as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    weights: { ...DEFAULT_SETTINGS.weights, ...saved.weights },
  };
}

export function saveSettings(value: Settings) {
  db.insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
