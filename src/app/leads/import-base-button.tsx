"use client";

import { useActionState } from "react";
import type { ImportStatus } from "@/lib/cnpj/import-job";
import { downloadCnpjBase } from "../actions";

export function ImportBaseButton({ status }: { status: ImportStatus }) {
  const [result, action, pending] = useActionState(downloadCnpjBase, null);
  const message = result?.message ?? (status.kind === "idle" ? null : status.message);
  const blocked = status.kind === "done" || status.kind === "running" || pending;

  return (
    <form action={action} className="tool">
      {status.kind === "running" && status.percent != null && (
        <div className="w-56">
          <div className="meter">
            <span style={{ width: `${status.percent}%` }} />
          </div>
          <p className="mute mt-1 text-xs">
            {status.percent}%{status.detail ? ` · ${status.detail}` : ""}
          </p>
        </div>
      )}
      {message && status.kind !== "running" && (
        <p className={`tool-note ${status.kind === "error" || result?.ok === false ? "danger" : "mute"}`}>
          {message}
        </p>
      )}
      <button
        disabled={blocked}
        className="btn"
      >
        {status.kind === "running" || pending
          ? "Baixando base…"
          : status.kind === "done"
            ? "Base já baixada neste mês"
            : "Baixar base da Receita"}
      </button>
    </form>
  );
}
