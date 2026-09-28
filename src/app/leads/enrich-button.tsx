"use client";

import { useActionState } from "react";
import type { LeadFilters } from "@/lib/leads";
import { enrichQualified } from "../actions";

export function EnrichButton({ filters }: { filters: LeadFilters }) {
  const [result, action, pending] = useActionState(enrichQualified, null);

  return (
    <form action={action} className="tool">
      <input type="hidden" name="ver" value="qualificados" />
      {filters.cityId && <input type="hidden" name="cidade" value={filters.cityId} />}
      {filters.segmentId && <input type="hidden" name="segmento" value={filters.segmentId} />}
      {filters.minScore && <input type="hidden" name="min" value={filters.minScore} />}
      {result && <p className={`tool-note ${result.ok ? "ok" : "danger"}`}>{result.message}</p>}
      <button disabled={pending} className="btn">
        {pending ? "Enriquecendo…" : "Enriquecer dados"}
      </button>
    </form>
  );
}
