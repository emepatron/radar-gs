import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const cities = sqliteTable(
  "cities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    uf: text("uf").notNull(),
    lowLat: real("low_lat"),
    lowLng: real("low_lng"),
    highLat: real("high_lat"),
    highLng: real("high_lng"),
  },
  (t) => [uniqueIndex("cities_name_uf").on(t.name, t.uf)],
);

export const segments = sqliteTable("segments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  query: text("query").notNull(),
  cnaes: text("cnaes").notNull().default(""),
});

export const SEARCH_STATUSES = ["queued", "running", "done", "quota", "error", "interrupted"] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

export const searches = sqliteTable("searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cityId: integer("city_id")
    .notNull()
    .references(() => cities.id),
  segmentId: integer("segment_id")
    .notNull()
    .references(() => segments.id),
  status: text("status", { enum: SEARCH_STATUSES }).notNull(),
  requestsUsed: integer("requests_used").notNull().default(0),
  placesFound: integer("places_found").notNull().default(0),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const places = sqliteTable("places", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  lat: real("lat"),
  lng: real("lng"),
  primaryType: text("primary_type"),
  types: text("types", { mode: "json" }).$type<string[]>().notNull(),
  businessStatus: text("business_status"),
  mapsUri: text("maps_uri"),
  phone: text("phone"),
  intlPhone: text("intl_phone"),
  website: text("website"),
  rating: real("rating"),
  ratingCount: integer("rating_count"),
  cityId: integer("city_id")
    .notNull()
    .references(() => cities.id),
  siteStatus: text("site_status", { enum: ["pending", "none", "ok", "error", "social", "offline"] })
    .notNull()
    .default("pending"),
  emails: text("emails", { mode: "json" }).$type<string[]>().notNull().default([]),
  instagram: text("instagram"),
  whatsapp: text("whatsapp"),
  whatsappSource: text("whatsapp_source", { enum: ["site", "celular"] }),
  metaPixel: integer("meta_pixel", { mode: "boolean" }).notNull().default(false),
  googleAds: integer("google_ads", { mode: "boolean" }).notNull().default(false),
  gtm: integer("gtm", { mode: "boolean" }).notNull().default(false),
  enrichedAt: integer("enriched_at", { mode: "timestamp_ms" }),
  cnpj: text("cnpj"),
  cnpjRazao: text("cnpj_razao"),
  cnpjSituacao: text("cnpj_situacao"),
  cnpjCnae: text("cnpj_cnae"),
  cnpjCnaeDescricao: text("cnpj_cnae_descricao"),
  cnaeMatch: text("cnae_match", { enum: ["confere", "diverge"] }),
  cnpjAssertiveness: integer("cnpj_assertiveness"),
  cnpjStatus: text("cnpj_status", { enum: ["confirmado", "nao_confirmado"] }),
  cnpjCheckedAt: integer("cnpj_checked_at", { mode: "timestamp_ms" }),
  score: integer("score").notNull().default(0),
  signals: text("signals", { mode: "json" }).$type<string[]>().notNull().default([]),
  optOut: integer("opt_out", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const placeSearches = sqliteTable(
  "place_searches",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id),
    searchId: integer("search_id")
      .notNull()
      .references(() => searches.id),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.searchId] })],
);

export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku", { enum: ["text_search", "geocoding"] }).notNull(),
    monthKey: text("month_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("api_usage_sku_month").on(t.sku, t.monthKey)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
});

export const cnpjEstablishments = sqliteTable(
  "cnpj_establishments",
  {
    cnpj: text("cnpj").primaryKey(),
    cnpjBasico: text("cnpj_basico").notNull(),
    razaoSocial: text("razao_social").notNull().default(""),
    nomeFantasia: text("nome_fantasia").notNull().default(""),
    situacao: text("situacao").notNull(),
    cnaePrincipal: text("cnae_principal").notNull(),
    cnaesSecundarios: text("cnaes_secundarios").notNull().default(""),
    cnaeDescricao: text("cnae_descricao").notNull().default(""),
    tipoLogradouro: text("tipo_logradouro").notNull().default(""),
    logradouro: text("logradouro").notNull().default(""),
    numero: text("numero").notNull().default(""),
    municipio: text("municipio").notNull(),
  },
  (t) => [index("cnpj_establishments_municipio").on(t.municipio), index("cnpj_establishments_basico").on(t.cnpjBasico)],
);

export type Place = typeof places.$inferSelect;
