<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Radar GS

Contexto completo em `README.md`.

## Restrições

- Tarefas vêm do chat, não do Plane.
- Custo zero: não adicionar campos ao field mask de `src/lib/google/places.ts` que mudem o SKU (avaliações, fotos, "atmosphere"). Qualquer chamada nova ao Google passa por `src/lib/quota.ts`.
- O limite mensal nunca passa de 1.000 (`FREE_MONTHLY_CAP`).
- Credenciais só no `.envrc` local. Nunca criar `.env` com valores, nunca imprimir as variáveis e nunca commitar credencial.
- Downloads de sites de terceiros só por `fetchPublicHtml` (`src/lib/safe-fetch.ts`).
- Não apagar registros de `places`: descadastro e exclusões são filtros.
- Enriquecimento de CNPJ só pela base pública da Receita (`npm run cnpj:import`). Não importar quadro de sócios nem telefone ou e-mail de pessoa física.
- Uso local (localhost). O servidor escuta só em `127.0.0.1`. Deploy exige auditoria de segurança e login antes.

## Padrões

- Versões fixas (`--save-exact`). TypeScript 5.9 até o Next.js suportar o 7.
- Mudou `schema.ts`: `npm run db:generate`. Antes de entregar: `npm test` e `npm run typecheck`.
- Textos da interface em português do Brasil.
