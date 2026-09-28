# Registro

## 2026-09-28

### Interface

- A navegação saiu da lateral e foi para uma faixa no topo, com a logo. No celular a faixa quebra em duas linhas.
- Buscas usa a largura da tela: cidade ao lado de Buscar, segmentos em pílulas e histórico em linhas, não numa tabela esticada.
- Leads mantém a tabela no computador. No celular cada lead vira um cartão, com os sinais embaixo do nome.
- A cota do mês continua uma linha. O número usado fica legível, sem virar o destaque da tela.
- Um aviso de hidratação no `<html>`, causado por extensão de navegador, fica silenciado. Não muda o que a tela faz.

### Cidades, segmentos e Receita

- Cidade e segmento não vêm prontos. Cada pessoa preenche `SEED_CITIES` e `SEED_SEGMENTS` em `src/lib/db/index.ts` e reinicia o servidor.
- O download da Receita fica só com as cidades cadastradas, em qualquer estado. O nome precisa ser o oficial do município.
- O CNAE fica no segmento (`cnaes`, 7 dígitos, separados por vírgula). Sem código, o cruzamento ainda confirma a empresa e a linha diz "Sem CNAE no segmento".
- Registro que já existe no banco local não é alterado nem apagado por essa mudança.

### Repositório

- O código público não leva banco, `.envrc` nem credencial. Cada pessoa cria os dela.
- A página do GitHub abre com a logo e o nome Radar. A licença é MIT.
- A imagem do cartão de compartilhamento está em `assets/social.png`. O GitHub não recebe essa capa pela API; ela se envia em Settings, Social preview.

### O que continua de fora

- Uso local, em `127.0.0.1:3000`. Sem publicação na internet.
- A barra de progresso do download da Receita não liga sozinha. O comando é `node scripts/watch-cnpj-import.mjs`.
- Ainda não há tela para cadastrar cidade ou segmento.
