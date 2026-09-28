import type { Place } from "../db/schema";
import type { Settings } from "../settings";

type Scorable = Pick<
  Place,
  "website" | "ratingCount" | "siteStatus" | "metaPixel" | "googleAds" | "gtm" | "whatsapp" | "instagram"
>;

const NO_OWN_SITE_LABEL: Partial<Record<Place["siteStatus"], string>> = {
  social: "Só rede social",
  offline: "Site fora do ar",
};

export function scorePlace(p: Scorable, { weights, minReviews }: Settings) {
  const signals: string[] = [];
  let score = 0;
  const add = (label: string, points: number) => {
    score += points;
    signals.push(`${label} (+${points})`);
  };

  if (!p.website) add("Sem site", weights.noSite);
  else if (NO_OWN_SITE_LABEL[p.siteStatus]) add(NO_OWN_SITE_LABEL[p.siteStatus]!, weights.noSite);
  if ((p.ratingCount ?? 0) >= minReviews) add(`${minReviews}+ avaliações`, weights.manyReviews);
  // GTM pode carregar pixels escondidos, então conta como "tem pixel".
  if (p.siteStatus === "ok" && !p.metaPixel && !p.googleAds && !p.gtm) add("Sem pixel de anúncios", weights.noAdsPixel);
  if (p.whatsapp && p.instagram) add("WhatsApp + Instagram", weights.whatsappInstagram);
  else if (p.whatsapp) add("WhatsApp", weights.whatsapp);

  return { score, signals };
}

const PUBLIC_BODY_TYPES = new Set([
  "government_office",
  "local_government_office",
  "courthouse",
  "city_hall",
  "police",
  "embassy",
  "fire_station",
  "post_office",
]);

const PUBLIC_BODY_NAME =
  /\b(OAB|Ordem dos Advogados|Promotoria|Minist[ée]rio P[úu]blico|Defensoria|F[óo]rum|Tribunal|Prefeitura|C[âa]mara Municipal|Delegacia|Justi[çc]a (Federal|do Trabalho|Eleitoral)|Procuradoria|Secretaria Municipal)\b/i;

export function isPublicBody(p: Pick<Place, "name" | "types" | "primaryType">) {
  return (
    PUBLIC_BODY_NAME.test(p.name) ||
    (p.primaryType != null && PUBLIC_BODY_TYPES.has(p.primaryType)) ||
    p.types.some((t) => PUBLIC_BODY_TYPES.has(t))
  );
}
