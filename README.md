# Autheria / Claudia's Community

Site de portfolio e encomendas com acompanhamento privado, Netlify Functions e Google Sheets.

## Estrutura

```text
public/                 Site publico: home, termos, track.html, css/, js/, assets/
netlify/functions/      Endpoints: orders, reviews e chat
server/                 Validacao e comunicacao privada com Apps Script
apps-script/Code.gs      Backend Google Sheets e migracao
scripts/                Build estatico
tests/                  Testes Node e navegador com planilha/e-mails simulados
docs/                   Plano, operacao e publicacao
dist/                   Build gerado; ignorado pelo Git
```

## Ambiente e comandos

Node 24.21.0 LTS (`.nvmrc`), Netlify CLI 27.8.0. No NVM para Windows:

```powershell
nvm install 24.21.0
nvm use 24.21.0
npm ci
npm run dev
```

Abra http://localhost:8888. `public/` e servido diretamente; atualize a pagina para ver alteracoes. As Functions ficam em `/.netlify/functions/`. Ctrl+C encerra o servidor. `--offline` evita vincular conta e carregar configuracao remota da Netlify; nao bloqueia chamadas a servicos externos.

```powershell
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

O build recria `dist/` apenas a partir de `public/`. A Netlify executa `npm run build`, publica `dist/` e empacota `netlify/functions/` separadamente. Nao edite `dist/` nem envie a raiz por upload manual. Nunca coloque segredos em `public/`.

A dependencia transitiva `sharp` tem override para 0.35.4, corrigindo alertas da versao incluída pela CLI. Reavaliar o override ao atualizar Netlify CLI. Ferramentas de desenvolvimento nao sao copiadas para `dist/`.

## Configuracao

Copie `.env.example` para `.env` sem sobrescrever arquivos existentes. Preencha:

- `APPS_SCRIPT_URL`: deployment **de teste** do Apps Script para uso local.
- `BACKEND_SECRET`: segredo novo, aleatorio, igual a propriedade de mesmo nome no Apps Script.
- `SITE_URL`: origem HTTPS do site de acompanhamento, igual nos dois ambientes.
- `GEMINI_API_KEY`: somente para o chatbot existente.

Reinicie o servidor apos alterar variaveis. Sem configuracao, pedidos e reviews retornam 503; nao ha fallback para a planilha de producao. O `.env` e ignorado pelo Git.

**Functions locais ainda podem escrever na planilha apontada por `APPS_SCRIPT_URL`.** Use uma copia da planilha e um deployment separado. Os testes automatizados substituem planilha, e-mails e rede: nao acessam dados reais.

## Fluxo atual

O cliente envia uma encomenda e recebe um link privado somente de leitura. A artista altera status/mensagem e visibilidade de reviews no Sheets. Recuperacao por e-mail entra em fila, processada a cada minuto: os links enviados duram 15 minutos; confirmar um deles substitui o acesso daquele pedido. O admin e a edicao publica foram removidos.

Leia [Operacao e publicacao](docs/OPERACAO-E-PUBLICACAO.md) antes de ativar o backend. Editar `apps-script/Code.gs` localmente nao atualiza o Apps Script publicado.

O [plano original](docs/PLANO-ACOMPANHAMENTO-PEDIDOS.md) registra decisoes e a lista de validacao. A implementacao local nao significa que os servicos ja foram migrados.

Referencias: [Netlify Dev](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/), [configuracao do build](https://docs.netlify.com/build/configure-builds/file-based-configuration/).
