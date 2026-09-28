import { requireEnv } from "../env";
import { reserveGeocoding } from "../quota";
import type { Rect } from "./places";

type GeocodeResponse = {
  status: string;
  error_message?: string;
  results: {
    geometry: {
      viewport: {
        northeast: { lat: number; lng: number };
        southwest: { lat: number; lng: number };
      };
    };
  }[];
};

export async function geocodeCity(name: string, uf: string): Promise<Rect> {
  const apiKey = requireEnv("GOOGLE_PLACES_API_KEY");
  reserveGeocoding();

  const params = new URLSearchParams({
    address: `${name}, ${uf}, Brasil`,
    components: `country:BR|administrative_area:${uf}`,
    language: "pt-BR",
    key: apiKey,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Geocoding API respondeu ${res.status}`);

  const data = (await res.json()) as GeocodeResponse;
  if (data.status !== "OK" || data.results.length === 0) {
    throw new Error(`Geocoding não encontrou ${name}/${uf}: ${data.status} ${data.error_message ?? ""}`.trim());
  }

  const { northeast, southwest } = data.results[0].geometry.viewport;
  return {
    low: { latitude: southwest.lat, longitude: southwest.lng },
    high: { latitude: northeast.lat, longitude: northeast.lng },
  };
}
