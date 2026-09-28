# Radar GS

Painel local de prospecção. Busca negócios no Google Maps por segmento e cidade, lê o site de cada negócio, pontua os leads e exporta para o Google Sheets. Um passo opcional cruza os qualificados com a base pública da Receita Federal para confirmar CNPJ, situação e CNAE.

Roda só na máquina de quem usa, em `http://localhost:3000`. O servidor escuta em `127.0.0.1`. Custo zero enquanto a conta do Google ficar dentro da cota gratuita da Places API.

Leads, banco e credenciais não vêm neste repositório. Cada pessoa cria os dela.

## Para rodar com uma IA

Passe este README e o `AGENTS.md` para a IA. Ela segue os passos abaixo. Não peça para ela inventar chave, planilha ou banco.

1. Ter Node.js 22 ou mais novo.
2. Clonar o repositório e entrar na pasta.
3. `npm install`. Se o npm bloquear o módulo nativo do SQLite, rodar `npm install-scripts approve better-sqlite3 esbuild` e `npm rebuild better-sqlite3`.
4. Copiar `.envrc.example` para `.envrc` e preencher as três variáveis com credenciais suas. O arquivo `.envrc` não entra no Git.
5. Se usar direnv: `direnv allow`. Sem direnv, exportar as mesmas variáveis no terminal antes de subir o servidor.
6. `npm run dev` e abrir `http://localhost:3000`.
7. Conferir com `npm test` e `npm run typecheck`.

Se a tela disser "Faltam as variáveis", o passo 4 ou o 5 ficou incompleto. Corrija e reinicie o `npm run dev`.

### O que colocar em cada variável

| Variável | O que é | Onde conseguir |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Chave da Places API (New), com Geocoding também liberada | Google Cloud, na sua conta |
| `GOOGLE_SHEETS_SA_JSON` | JSON da conta de serviço, numa linha ou via `cat` do arquivo | Google Cloud. Compartilhe a planilha com o e-mail dessa conta, como editora |
| `RADAR_SHEET_ID` | ID da planilha, o trecho da URL entre `/d/` e `/edit` | Uma planilha vazia sua, chamada como quiser |

A chave e o JSON nunca vão para o código, para o chat nem para o Git. O `GOOGLE_SHEETS_SA_JSON` pode ser o conteúdo do arquivo, desde que só exista no `.envrc` local.

### O que não copiar de outra pessoa

Não copie `data/`, `.envrc` nem exportação de planilha. O banco nasce vazio na primeira execução e já traz as cidades e os segmentos iniciais. A base da Receita se baixa pelo botão, na tela de leads, uma vez por mês. O download passa de 6 GB, filtra as quatro cidades e apaga os arquivos grandes. Sem essa base, "Enriquecer dados" só avisa.

## Como usar

1. **Buscas**: escolher a cidade, marcar os segmentos e clicar em Buscar. O histórico atualiza sozinho. O topo mostra a cota usada no mês.
2. **Leads**: visões **Qualificados** (pontuação mínima definida em Configurações), **Todos** e **Enriquecidos**. Filtros por cidade, segmento e pontuação. Cada lead mostra os sinais que somaram pontos, telefone, WhatsApp, Instagram, e-mails, site e pixels. Enriquecidos mostra também a taxa do cruzamento, o CNPJ, a situação e se o CNAE confere.
3. **Enriquecer dados**: na visão Qualificados, cruza os leads do filtro com a base da Receita. Não gasta busca do Google. Quem fica com um único CNPJ passa para Enriquecidos. Quem já foi cruzado não é refeito, a menos que a base da Receita seja importada de novo.
4. **Exportar para o Google Sheets**: Qualificados e Todos vão para a aba `Leads`. Enriquecidos vai para a aba `Enriquecidos`. Nas duas, as linhas são atualizadas pelo `place_id`. Na aba `Leads`, colunas criadas depois da coluna P (status, anotações) não são tocadas.
5. **Descadastrar**: tira o lead das listas. Se ele já estava na planilha, a linha é marcada como "NÃO CONTATAR" na próxima exportação.
6. **Reverificar sites com erro**: tenta ler de novo os sites que falharam, sem gastar buscas do Google.
7. **Configurações**: pesos da pontuação, mínimo de avaliações, pontuação mínima para "qualificado", limite mensal de buscas e profundidade de divisão do mapa. Salvar recalcula todas as pontuações.

## Pontuação

| Sinal | Pontos padrão | Condição |
| --- | --- | --- |
| Sem site | +30 | Sem site, site fora do ar (domínio não existe) ou só rede social cadastrada como site |
| Muitas avaliações | +25 | 40 avaliações ou mais |
| Sem pixel de anúncios | +20 | Site lido e sem pixel da Meta, tag do Google Ads ou Google Tag Manager |
| Tem WhatsApp | +10 | Link no site, link cadastrado como site ou celular (DDD + 9 dígitos começando em 9) |
| Tem WhatsApp e Instagram | +20 | Substitui o +10 |

- Qualificado: 40 pontos ou mais (padrão).
- Órgãos públicos (OAB, Promotoria, Fórum, Prefeitura, Delegacia etc.) nunca aparecem nas listas nem na exportação, mas ficam no banco.
- Negócios com status diferente de "em funcionamento" no Google ficam fora das listas.
- O Instagram só é encontrado pelo site ou pelo link cadastrado. Sem site, fica "não verificado".
- O GTM conta como "tem pixel", porque pode carregar pixels escondidos.

## Enriquecimento por CNPJ

O botão **Baixar base da Receita**, na tela de leads, baixa a base pública uma vez por mês. No mesmo mês o botão fica desligado. Se o download falhar, dá para tentar de novo. O comando `npm run cnpj:import` faz a mesma coisa.

Durante o download, a tela de leads mostra uma barra com a porcentagem e o arquivo em leitura. A barra depende de `node scripts/watch-cnpj-import.mjs` rodando ao lado. O script compara o arquivo em download com o tamanho de cada arquivo da Receita e grava `data/cnpj-progress.json`. Sem ele, a tela mostra só o texto "Baixando". Os tamanhos de referência no script são de setembro de 2026. Nos meses seguintes a porcentagem é aproximada.

O comando baixa o mês mais recente dos dados abertos da Receita (compartilhamento público em `arquivos.receitafederal.gov.br`, pasta `Dados/Cadastros/CNPJ`). Usa estabelecimentos, empresas, municípios e CNAEs. Fica só com Lucas do Rio Verde, Sorriso, Sinop e Cuiabá, e apaga cada arquivo depois de filtrar. O maior arquivo passa de 2 GB. Não baixa o quadro de sócios: telefone e e-mail de pessoa física não entram. A base fica em `data/radar.db`, que já está fora do Git. Se a importação filtrar menos de 1.000 estabelecimentos, ela para e mantém a base anterior.

O cruzamento compara o nome do Google com o nome fantasia e a razão social na mesma cidade. Tira acento e sufixo jurídico do final do nome (LTDA, ME, EPP, S/A). "Nome parecido" exige o nome inteiro de um lado dentro do outro, com tamanho mínimo, para uma palavra curta como "clínica" não casar com tudo. Dois endereços da mesma empresa (matriz e filial) contam como um CNPJ.

| Resultado | Taxa | Entra em Enriquecidos |
| --- | --- | --- |
| Nome igual, único CNPJ na cidade, endereço compatível | 100% | Sim |
| Nome igual, único, sem endereço para comparar | 80% | Sim |
| Nome parecido, único | 60% | Sim |
| Nome igual, único, mas a rua diverge | — | Não |
| Nenhum CNPJ ou dois CNPJs diferentes | — | Não |

A taxa mede só se o anúncio é aquela empresa. Ao lado, separado, fica **CNAE confere** ou **CNAE diverge**. Empresa baixada ou inapta continua na lista, com a situação escrita na linha.

| Segmento | CNAE que confere |
| --- | --- |
| Advocacia | 6911-7/01 |
| Clínica de estética facial | 9602-5/02 |
| Clínica odontológica | 8630-5/04 |
| Academia | 9313-1/00 |

Vale o CNAE principal ou um secundário. A exportação de Enriquecidos grava, na aba `Enriquecidos`: place_id, nome, pontuação, taxa, CNPJ, razão social, situação, CNAE, conferência do CNAE, telefone, WhatsApp, cidade, segmentos, Google Maps e observação. Quem foi descadastrado e já estava nessa aba é marcado como "NÃO CONTATAR" na próxima exportação.

## Cidades e segmentos

Cadastrados: Lucas do Rio Verde, Sorriso, Sinop e Cuiabá (MT); Advocacia, Clínica de estética facial, Clínica odontológica e Academia.

Academia dispara duas buscas na mesma cidade: "academia de ginástica" e "academia de musculação". O mesmo lugar não entra duas vezes.

Para adicionar, editar `SEED_CITIES` ou `SEED_SEGMENTS` em `src/lib/db/index.ts` e reiniciar o `npm run dev`. Os novos entram no banco na inicialização; os existentes não são alterados. O campo `query` é o texto enviado ao Google (o radar acrescenta "em <cidade>"). Várias frases no mesmo segmento se separam com `;`. Cada frase é uma varredura e gasta cota. Academia usa isso, então consome cerca do dobro de buscas de um segmento com frase única.

## Custo e cota

| Camada | Limite |
| --- | --- |
| Cota gratuita do Google (Text Search Enterprise) | 1.000 buscas por mês, somadas por conta de faturamento |
| Cota diária configurada no Google Cloud | 150 buscas por dia |
| Limite mensal interno do radar | Para em 950 buscas (editável até 1.000) |
| Geocoding (1 chamada por cidade, guardada no banco) | 10 mil grátis por mês |

- Cada página de resultados é uma busca e traz até 20 negócios; a API entrega no máximo 60 por área.
- Quando uma área chega a 60, o radar divide em 4 e busca de novo (até a profundidade configurada).
- O mês é contado no fuso do Pacífico, igual à cobrança do Google.
- Risco aceito: se o contador interno falhar, o Google deixa passar até 150 buscas por dia. No pior caso, cerca de US$ 128 no mês.
- Quando a cota diária do Google acaba, a busca para e grava "Cota excedida. Tente novamente amanhã." O histórico esconde essas buscas e mostra só essa frase acima da lista. O limite mensal interno continua com a mensagem própria.
## Arquitetura

Next.js 16 (App Router, server actions) + TypeScript + Drizzle ORM + SQLite (`better-sqlite3`) + Tailwind 4. Versões fixas no `package.json`.

```
src/
  app/
    page.tsx                  Buscas: formulário, cota e histórico
    leads/                    Leads: visões, filtros, exportação, reverificação
    configuracoes/            Pesos e limites
    actions.ts                Server actions (buscar, exportar, descadastrar, configurar)
  lib/
    db/schema.ts              Tabelas
    db/index.ts               Conexão, migrações, cidades e segmentos iniciais
    google/places.ts          Text Search (field mask que define o SKU cobrado)
    google/geocode.ts         Cidade → retângulo geográfico
    radar/scan.ts             Fila, varredura por quadrantes, enriquecimento e pontuação
    radar/queries.ts          Uma ou mais frases de busca por segmento
    radar/enrich.ts           Leitura do site: e-mail, Instagram, WhatsApp, pixels
    radar/score.ts            Pontuação e detecção de órgão público
    cnpj/                     Cruzamento com a Receita: nome, taxa e CNAE
    safe-fetch.ts             Download de sites só para endereços públicos
    quota.ts                  Contador, limite mensal e cota diária do Google
    leads.ts                  Consulta de leads com filtros
    sheets.ts                 Exportação para o Google Sheets
    settings.ts               Configurações com valores padrão
scripts/import-cnpj.ts        Baixa a base da Receita e fica só com as quatro cidades
scripts/watch-cnpj-import.mjs Porcentagem do download para a barra da tela de leads
drizzle/                      Migrações SQL geradas
data/radar.db                 Banco (fora do Git)
```

### Dados

Banco SQLite em `data/radar.db`, na pasta do projeto. Não é contêiner nem serviço: é um arquivo aberto pelo próprio Next.js. Para backup, copiar a pasta `data/` com o servidor parado. Essa pasta não entra no Git.

Tabelas: `cities`, `segments`, `searches`, `places`, `place_searches` (em quais buscas cada negócio apareceu), `api_usage` (cada chamada ao Google), `settings` e `cnpj_establishments` (estabelecimentos das quatro cidades, vindos da Receita).

Mudou o `schema.ts`? Rodar `npm run db:generate`; a migração é aplicada ao iniciar o servidor.

### Decisões

- A fila de buscas roda uma por vez, na memória do processo. Se o servidor for reiniciado no meio, a busca fica como "Interrompida" e precisa ser disparada de novo.
- O uso da API é registrado antes de cada chamada, para nunca subcontar.
- O download de sites valida cada redirecionamento e recusa endereços internos da rede (proteção contra SSRF), com tempo limite e tamanho máximo.
- Site com erro é tentado de novo com 25 segundos. Domínio inexistente não é tentado de novo: vira "site fora do ar".
- A troca para Postgres no futuro passa pelo Drizzle (mudar o driver e o dialeto em `db/index.ts`, `schema.ts` e `drizzle.config.ts`).
- O CNPJ não vem do Google. O cruzamento usa a base pública da Receita, gravada no próprio SQLite. A taxa mede se o anúncio é a empresa; o CNAE é uma marca separada e não tira o lead da lista.
- A aba `Enriquecidos` existe para não escrever nas colunas de status e anotação da aba `Leads`, que começam depois da coluna P.

## Testes

```bash
npm test          # 45 testes: leitura de site, WhatsApp, pontuação, órgão público, SSRF, cruzamento de CNPJ, cota diária
npm run typecheck
```

## Pendências conhecidas

- O botão "Baixar base da Receita" não liga o script da barra de progresso. Rode `node scripts/watch-cnpj-import.mjs` depois de clicar, ou a tela mostra só o texto.
- Enquanto a base da Receita não termina de baixar, "Enriquecer dados" só avisa.
- Cidades e segmentos só são adicionados pelo código (ainda não há tela para isso).
- Se a Receita trocar o link público dos dados abertos, atualizar o token em `scripts/import-cnpj.ts`. Esse token é o compartilhamento público dos dados abertos, não uma credencial do projeto.
- Os alertas moderados do `npm audit` estão no `drizzle-kit` (ferramenta de desenvolvimento). Não afetam o painel.
