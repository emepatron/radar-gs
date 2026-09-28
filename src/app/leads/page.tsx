import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { cities, places, segments } from "@/lib/db/schema";
import { getImportStatus } from "@/lib/cnpj/import-job";
import { formatCnae, formatCnpj } from "@/lib/cnpj/text";
import { listLeads, parseLeadFilters, type LeadView } from "@/lib/leads";
import { getSettings } from "@/lib/settings";
import { AutoRefresh } from "../auto-refresh";
import { toggleOptOut } from "../actions";
import { EnrichButton } from "./enrich-button";
import { ImportBaseButton } from "./import-base-button";
import { ExportButton } from "./export-button";
import { ReverifyButton } from "./reverify-button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEW_LABEL: Record<LeadView, string> = {
  qualificados: "Qualificados",
  todos: "Todos",
  enriquecidos: "Enriquecidos",
};

const SITE_STATUS: Record<string, string> = {
  ok: "",
  none: "",
  error: "site não verificado",
  pending: "aguardando",
  social: "só rede social",
  offline: "site fora do ar",
};

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const get = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const filters = parseLeadFilters(get);
  const leads = listLeads(filters);
  const counts: Record<LeadView, number> = {
    qualificados: filters.view === "qualificados" ? leads.length : listLeads({ ...filters, view: "qualificados" }).length,
    todos: filters.view === "todos" ? leads.length : listLeads({ ...filters, view: "todos" }).length,
    enriquecidos: filters.view === "enriquecidos" ? leads.length : listLeads({ ...filters, view: "enriquecidos" }).length,
  };
  const failedSites = await db.$count(places, eq(places.siteStatus, "error"));
  const importStatus = getImportStatus();
  const cityRows = db.select().from(cities).orderBy(cities.id).all();
  const segmentRows = db.select().from(segments).orderBy(segments.id).all();

  const viewHref = (view: LeadView) => {
    const query = new URLSearchParams();
    for (const key of ["cidade", "segmento", "min", "optout"]) {
      const v = get(key);
      if (v) query.set(key, v);
    }
    query.set("ver", view);
    return `/leads?${query}`;
  };

  return (
    <div className="space-y-6">
      <AutoRefresh active={importStatus.kind === "running"} />
      <div className="flex items-center gap-2 text-sm">
        <span className="mute">Visualizar:</span>
        {(["qualificados", "todos", "enriquecidos"] as const).map((view) => (
          <Link key={view} href={viewHref(view)} className={filters.view === view ? "nav-on" : "nav-off"}>
            {VIEW_LABEL[view]} ({counts[view]})
          </Link>
        ))}
        {filters.view === "qualificados" && (
          <span className="mute text-xs">
            Pontuação a partir de {getSettings().minQualifiedScore}, editável em Configurações.
          </span>
        )}
        {filters.view === "enriquecidos" && (
          <span className="mute text-xs">Só entram leads com um único CNPJ confirmado.</span>
        )}
      </div>

      <form className="panel flex flex-wrap items-end gap-4 text-sm">
        <input type="hidden" name="ver" value={filters.view} />
        <label>
          <span className="mute mb-1 block">Cidade</span>
          <select name="cidade" defaultValue={filters.cityId ?? ""}>
            <option value="">Todas</option>
            {cityRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mute mb-1 block">Segmento</span>
          <select name="segmento" defaultValue={filters.segmentId ?? ""}>
            <option value="">Todos</option>
            {segmentRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mute mb-1 block">Pontuação mínima</span>
          <input type="number" name="min" min={0} defaultValue={filters.minScore ?? ""} className="w-28" />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="optout" value="1" defaultChecked={filters.showOptOut} />
          Mostrar descadastrados
        </label>
        <button className="btn">Filtrar</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <p className="mute text-sm">{leads.length} leads</p>
          {failedSites > 0 && <ReverifyButton count={failedSites} />}
          <ImportBaseButton status={importStatus} />
          {filters.view === "qualificados" && <EnrichButton filters={filters} />}
        </div>
        <ExportButton filters={filters} />
      </div>

      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="px-3 py-2">Pontos</th>
              <th className="px-3">Negócio</th>
              {filters.view === "enriquecidos" && <th className="px-3">Receita</th>}
              <th className="px-3">Sinais</th>
              <th className="px-3">Contato</th>
              <th className="px-3">Avaliações</th>
              <th className="px-3">Site</th>
              <th className="px-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className={l.optOut ? "opacity-50" : undefined}>
                <td className="px-3 py-3 text-lg font-semibold">{l.score}</td>
                <td className="px-3 py-3">
                  <a href={l.mapsUri ?? "#"} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {l.name}
                  </a>
                  <p className="mute text-xs">{l.address}</p>
                  <p className="faint text-xs">{l.segmentNames}</p>
                </td>
                {filters.view === "enriquecidos" && (
                  <td className="px-3 py-3 text-xs">
                    <p className="font-medium">{l.cnpjAssertiveness}%</p>
                    <p>{l.cnpj ? formatCnpj(l.cnpj) : ""}</p>
                    <p>{l.cnpjRazao}</p>
                    <p className="mute">{l.cnpjSituacao}</p>
                    <p>
                      {l.cnaeMatch === "confere" ? "CNAE confere" : "CNAE diverge"}
                      {l.cnpjCnae ? ` · ${formatCnae(l.cnpjCnae)}` : ""}
                    </p>
                    {l.cnpjCnaeDescricao && <p className="mute">{l.cnpjCnaeDescricao}</p>}
                  </td>
                )}
                <td className="px-3 py-3">
                  <ul className="space-y-0.5 text-xs">
                    {l.signals.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-3 text-xs">
                  {l.phone && <p>{l.phone}</p>}
                  {l.whatsapp ? (
                    <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className="block underline">
                      WhatsApp{l.whatsappSource === "celular" ? " (celular)" : ""}
                    </a>
                  ) : (
                    <p className="faint">Sem WhatsApp</p>
                  )}
                  {l.instagram ? (
                    <a href={l.instagram} target="_blank" rel="noopener noreferrer" className="block underline">
                      Instagram
                    </a>
                  ) : (
                    <p className="faint">{l.siteStatus === "ok" ? "Sem Instagram" : "Instagram não verificado"}</p>
                  )}
                  {l.emails.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                </td>
                <td className="px-3 py-3 text-xs">
                  {l.ratingCount ?? 0} {l.rating ? `· nota ${l.rating}` : ""}
                </td>
                <td className="px-3 py-3 text-xs">
                  {l.website ? (
                    <a href={l.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {new URL(l.website).hostname}
                    </a>
                  ) : (
                    <span className="faint">Sem site</span>
                  )}
                  <p className="faint">{SITE_STATUS[l.siteStatus]}</p>
                  {l.siteStatus === "ok" && (
                    <p className="faint">
                      {[l.metaPixel && "Pixel Meta", l.googleAds && "Google Ads", l.gtm && "GTM"].filter(Boolean).join(", ") ||
                        "Sem pixel"}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <form action={toggleOptOut}>
                    <input type="hidden" name="placeId" value={l.id} />
                    <button className="mute text-xs hover:text-[var(--danger)]">
                      {l.optOut ? "Reativar" : "Descadastrar"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
