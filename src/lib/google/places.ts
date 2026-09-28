import { requireEnv } from "../env";
import { reserveTextSearch } from "../quota";

export type LatLng = { latitude: number; longitude: number };
export type Rect = { low: LatLng; high: LatLng };

export type ApiPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: LatLng;
  types?: string[];
  primaryType?: string;
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
};

// Estes campos cobram o SKU Text Search Enterprise. Campos de avaliações, fotos ou "atmosphere" mudariam o SKU.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

export async function searchText(textQuery: string, rect: Rect, pageToken?: string) {
  const apiKey = requireEnv("GOOGLE_PLACES_API_KEY");
  reserveTextSearch();

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      locationRestriction: { rectangle: rect },
      ...(pageToken ? { pageToken } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Places API respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
  return { places: data.places ?? [], nextPageToken: data.nextPageToken };
}
