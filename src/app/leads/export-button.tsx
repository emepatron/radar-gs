"use client";

import { useActionState } from "react";
import type { LeadFilters } from "@/lib/leads";
import { exportLeads } from "../actions";

export function ExportButton({ filters }: { filters: LeadFilters }) {
  const [result, action, pending] = useActionState(exportLeads, null);

  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="ver" value={filters.view} />
      {filters.cityId && <input type="hidden" name="cidade" value={filters.cityId} />}
      {filters.segmentId && <input type="hidden" name="segmento" value={filters.segmentId} />}
      {filters.minScore && <input type="hidden" name="min" value={filters.minScore} />}
      {result && <p className={`text-sm ${result.ok ? "ok" : "danger"}`}>{result.message}</p>}
      <button disabled={pending} className="btn-primary">
        {pending ? "Exportando…" : "Exportar para o Google Sheets"}
      </button>
    </form>
  );
}
