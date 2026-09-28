import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { cnpjEstablishments, places, segments } from "../db/schema";
import { indexEstablishments, matchPlace } from "./match";
import { getCnpjImportedAt } from "./meta";
import type { Establishment } from "./parse";
import { cnaesForSegmentNames } from "./segments";

type CnpjRow = typeof cnpjEstablishments.$inferSelect;

export class CnpjBaseMissingError extends Error {
  constructor() {
    super("Base da Receita ainda não importada. Use o botão Baixar base da Receita. Isso é uma vez por mês.");
    this.name = "CnpjBaseMissingError";
  }
}

export type CrossLead = {
  id: string;
  name: string;
  address: string | null;
  cityName: string;
  segmentNames: string;
  cnpjCheckedAt: Date | null;
};

export function crossQualified(leads: CrossLead[], onlySegment: string | null) {
  const total = db.select({ n: sql<number>`count(*)` }).from(cnpjEstablishments).get()?.n ?? 0;
  if (total === 0) throw new CnpjBaseMissingError();

  const importedAt = getCnpjImportedAt();
  const pending = leads.filter(
    (lead) => !lead.cnpjCheckedAt || (importedAt != null && lead.cnpjCheckedAt.getTime() < importedAt),
  );
  const skipped = leads.length - pending.length;
  if (pending.length === 0) return { confirmed: 0, unconfirmed: 0, skipped };

  const catalog = db.select({ name: segments.name, cnaes: segments.cnaes }).from(segments).all();
  const cache = new Map<string, ReturnType<typeof indexEstablishments>>();
  const now = new Date();
  let confirmed = 0;
  let unconfirmed = 0;

  db.transaction((tx) => {
    for (const lead of pending) {
      let index = cache.get(lead.cityName);
      if (!index) {
        const rows = tx
          .select()
          .from(cnpjEstablishments)
          .where(eq(cnpjEstablishments.municipio, lead.cityName))
          .all();
        index = indexEstablishments(rows.map(toEstablishment));
        cache.set(lead.cityName, index);
      }

      const names = onlySegment
        ? [onlySegment]
        : lead.segmentNames
            .split(", ")
            .map((name) => name.trim())
            .filter(Boolean);
      const result = matchPlace(
        { name: lead.name, address: lead.address },
        index,
        cnaesForSegmentNames(catalog, names),
      );
      const cleared = {
        cnpj: null,
        cnpjRazao: null,
        cnpjSituacao: null,
        cnpjCnae: null,
        cnpjCnaeDescricao: null,
        cnaeMatch: null,
        cnpjAssertiveness: null,
        cnpjStatus: "nao_confirmado" as const,
        cnpjCheckedAt: now,
      };

      if (result.status === "confirmado") {
        confirmed++;
        tx.update(places)
          .set({
            cnpj: result.cnpj,
            cnpjRazao: result.razao,
            cnpjSituacao: result.situacao,
            cnpjCnae: result.cnae,
            cnpjCnaeDescricao: result.cnaeDescricao,
            cnaeMatch: result.cnaeMatch,
            cnpjAssertiveness: result.assertiveness,
            cnpjStatus: "confirmado",
            cnpjCheckedAt: now,
          })
          .where(eq(places.id, lead.id))
          .run();
      } else {
        unconfirmed++;
        tx.update(places).set(cleared).where(eq(places.id, lead.id)).run();
      }
    }
  });

  return { confirmed, unconfirmed, skipped };
}

function toEstablishment(row: CnpjRow): Establishment {
  return {
    cnpj: row.cnpj,
    cnpjBasico: row.cnpjBasico,
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia,
    situacao: row.situacao,
    cnaePrincipal: row.cnaePrincipal,
    cnaesSecundarios: row.cnaesSecundarios ? row.cnaesSecundarios.split(",") : [],
    cnaeDescricao: row.cnaeDescricao,
    tipoLogradouro: row.tipoLogradouro,
    logradouro: row.logradouro,
    numero: row.numero,
    municipio: row.municipio,
  };
}
