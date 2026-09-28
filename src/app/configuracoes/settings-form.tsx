"use client";

import { useActionState } from "react";
import type { Settings } from "@/lib/settings";
import { updateSettings } from "../actions";

function Field({ label, name, value, hint }: { label: string; name: string; value: number; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mute mb-1 block">{label}</span>
      <input type="number" name={name} min={0} step={1} defaultValue={value} className="w-32" />
      {hint && <span className="faint mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [result, action, pending] = useActionState(updateSettings, null);
  const { weights } = settings;

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <section className="panel space-y-4">
        <h2 className="font-semibold">Pesos da pontuação</h2>
        <div className="fields">
          <Field label="Sem site" name="noSite" value={weights.noSite} />
          <Field label="Muitas avaliações" name="manyReviews" value={weights.manyReviews} />
          <Field label="Sem pixel de anúncios" name="noAdsPixel" value={weights.noAdsPixel} hint="Só conta quando o site foi verificado." />
          <Field label="Tem WhatsApp" name="whatsapp" value={weights.whatsapp} />
          <Field
            label="Tem WhatsApp e Instagram"
            name="whatsappInstagram"
            value={weights.whatsappInstagram}
            hint="Substitui o peso de só WhatsApp."
          />
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="font-semibold">Critérios e limites</h2>
        <div className="fields">
          <Field label="Mínimo de avaliações para “muitas avaliações”" name="minReviews" value={settings.minReviews} />
          <Field
            label="Pontuação mínima para “qualificado”"
            name="minQualifiedScore"
            value={settings.minQualifiedScore}
            hint="Define quem aparece na visão Qualificados."
          />
          <Field
            label="Limite mensal de buscas"
            name="monthlyLimit"
            value={settings.monthlyLimit}
            hint="Máximo 1.000, a cota gratuita do Google."
          />
          <Field
            label="Profundidade de divisão do mapa"
            name="maxDepth"
            value={settings.maxDepth}
            hint="Quantas vezes uma área cheia pode ser dividida em 4 (máximo 5)."
          />
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          disabled={pending}
          className="btn-primary"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        {result && <p className={`text-sm ${result.ok ? "ok" : "danger"}`}>{result.message}</p>}
      </div>
    </form>
  );
}
