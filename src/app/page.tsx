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

  const ratio = monthlyLimit > 0 ? used / monthlyLimit : 0;

  return (
    <div className="space-y-5">
      <AutoRefresh active={active} />

      <section className="panel quota">
        <div className="split">
          <h2 className="font-semibold">Cota do mês</h2>
          <p className="quota-count">
            {used}
            <span>
              {" "}
              de {monthlyLimit} · {monthKey()}
            </span>
          </p>
        </div>
        <div className={`meter ${ratio > 0.8 ? "warn" : ""}`}>
          <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <p className="faint text-sm">Geocodificações de cidades no mês: {geocoding} (10 mil grátis).</p>
      </section>

      <section className="panel">
        <h2 className="font-semibold">Nova busca</h2>
        <form action={startSearches} className="search-form">
          <div className="search-bar">
            <label className="text-sm">
              <span className="mute">Cidade</span>
              <select name="cityId" required>
                {cityRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}/{c.uf}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary">Buscar</button>
          </div>
          <fieldset className="text-sm">
            <legend className="mute">Segmentos</legend>
            <div className="chips">
              {segmentRows.map((s) => (
                <label key={s.id} className="chip">
                  <input type="checkbox" name="segmentIds" value={s.id} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      </section>

      <section className="panel">
        <h2 className="font-semibold">Histórico</h2>
        {dailyQuota && <p className="warn text-sm">Cota excedida. Tente novamente amanhã.</p>}
        {visibleRows.length === 0 ? (
          dailyQuota ? null : <p className="mute text-sm">Nenhuma busca ainda.</p>
        ) : (
          <ul className="runs">
            {visibleRows.map(({ search, cityName, segmentName }) => (
              <li key={search.id} className="run">
                <div>
                  <p className="run-city">{cityName}</p>
                  <p className="mute text-sm">{segmentName}</p>
                </div>
                <p className={statusTone(search.status)}>
                  {STATUS_LABEL[search.status]}
                  {search.error && <span className="danger block text-xs">{search.error}</span>}
                </p>
                <p className="run-num">
                  {search.requestsUsed}
                  <span>Buscas usadas</span>
                </p>
                <p className="run-num">
                  {search.placesFound || "—"}
                  <span>Negócios</span>
                </p>
                <time className="faint text-sm" dateTime={search.createdAt.toISOString()}>
                  {search.createdAt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function statusTone(status: SearchStatus) {
  if (status === "running" || status === "queued") return "warn text-sm";
  if (status === "error" || status === "quota" || status === "interrupted") return "danger text-sm";
  return "mute text-sm";
}
