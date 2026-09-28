import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cities, searches, segments, type SearchStatus } from "@/lib/db/schema";
import { isDailyQuotaError, monthKey, usageThisMonth } from "@/lib/quota";
import { getSettings } from "@/lib/settings";
import { startSearches } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<SearchStatus, string> = {
  queued: "Na fila",
  running: "Buscando…",
  done: "Concluída",
  quota: "Parou no limite mensal",
  error: "Erro",
  interrupted: "Interrompida",
};

export default function SearchesPage() {
  const cityRows = db.select().from(cities).orderBy(cities.id).all();
  const segmentRows = db.select().from(segments).orderBy(segments.id).all();
  const searchRows = db
    .select({ search: searches, cityName: cities.name, segmentName: segments.name })
    .from(searches)
    .innerJoin(cities, eq(cities.id, searches.cityId))
    .innerJoin(segments, eq(segments.id, searches.segmentId))
    .orderBy(desc(searches.id))
    .limit(50)
    .all();

  const { monthlyLimit } = getSettings();
  const used = usageThisMonth("text_search");
  const geocoding = usageThisMonth("geocoding");
  const active = searchRows.some((r) => r.search.status === "queued" || r.search.status === "running");
  const dailyQuota = searchRows.some((r) => isDailyQuotaError(r.search.error));
  const visibleRows = searchRows.filter((r) => !isDailyQuotaError(r.search.error));

  return (
    <div className="space-y-8">
      <AutoRefresh active={active} />

      <section className="panel">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-semibold">Cota do mês</h2>
          <p className="mute text-sm">
            {used} de {monthlyLimit} · {monthKey()}
          </p>
        </div>
        <div className={`meter mt-3 ${used / monthlyLimit > 0.8 ? "warn" : ""}`}>
          <span style={{ width: `${Math.min(100, (used / monthlyLimit) * 100)}%` }} />
        </div>
        <p className="mute mt-3 text-sm">Geocodificações de cidades no mês: {geocoding} (10 mil grátis).</p>
      </section>

      <section className="panel">
        <h2 className="mb-4 font-semibold">Nova busca</h2>
        <form action={startSearches} className="flex flex-wrap items-end gap-6">
          <label className="text-sm">
            <span className="mute mb-1 block">Cidade</span>
            <select name="cityId" required>
              {cityRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}/{c.uf}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-sm">
            <legend className="mute mb-1">Segmentos</legend>
            <div className="flex flex-wrap gap-4">
              {segmentRows.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" name="segmentIds" value={s.id} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-primary">Buscar</button>
        </form>
      </section>

      <section className="panel">
        <h2 className="mb-4 font-semibold">Histórico</h2>
        {dailyQuota && <p className="warn mb-4 text-sm">Cota excedida. Tente novamente amanhã.</p>}
        {visibleRows.length === 0 ? (
          dailyQuota ? null : <p className="mute text-sm">Nenhuma busca ainda.</p>
        ) : (
          <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="py-2">Cidade</th>
                <th>Segmento</th>
                <th>Status</th>
                <th>Buscas usadas</th>
                <th>Negócios</th>
                <th>Início</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ search, cityName, segmentName }) => (
                <tr key={search.id}>
                  <td className="py-2">{cityName}</td>
                  <td>{segmentName}</td>
                  <td>
                    {STATUS_LABEL[search.status]}
                    {search.error && <p className="danger max-w-md text-xs">{search.error}</p>}
                  </td>
                  <td>{search.requestsUsed}</td>
                  <td>{search.placesFound || "—"}</td>
                  <td>{search.createdAt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
