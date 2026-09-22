# Autheria / Claudia's Community

Portfolio and art-commission site with private order tracking, Netlify Functions, and Google Sheets.

## Project structure

```text
public/                 Public site: home, terms, track.html, css/, js/, assets/
netlify/functions/      Endpoints: orders, reviews, and chat
server/                 Validation and private Apps Script communication
apps-script/Code.gs     Google Sheets backend and migration
scripts/                Static build
tests/                  Node and browser tests using mocked sheets and email
docs/                   Plan, operations, and publishing documentation
dist/                   Generated build; ignored by Git
```

## Environment and commands

Node 24.21.0 LTS (`.nvmrc`) and Netlify CLI 27.8.0 are required. With NVM for Windows:

```powershell
nvm install 24.21.0
nvm use 24.21.0
npm ci
npm run dev
```

Open http://localhost:8888. `public/` is served directly; reload after edits. Functions are available under `/.netlify/functions/`. Ctrl+C stops the server. `--offline` avoids linking a Netlify account and loading remote Netlify configuration; it does not block external services.

```powershell
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

The build recreates `dist/` from `public/` only. Netlify runs `npm run build`, publishes `dist/`, and packages `netlify/functions/` separately. Do not edit `dist/` or upload the repository root manually. Never put secrets in `public/`.

The transitive `sharp` dependency is overridden to 0.35.4 to address alerts from the version included by the CLI. Re-evaluate the override when updating Netlify CLI. Development tooling is not copied to `dist/`.

## Configuration

Copy `.env.example` to `.env` without overwriting an existing file. Set:

- `APPS_SCRIPT_URL`: the **test** Apps Script deployment used from local development.
- `BACKEND_SECRET`: a new random secret, identical to the Apps Script property with the same name.
- `SITE_URL`: the HTTPS origin of the tracking site, identical in both environments.
- `GEMINI_API_KEY`: only for the existing chatbot.

Restart the local server after changing variables. Without configuration, orders and reviews return 503; there is no production-sheet fallback. `.env` is ignored by Git.

**Local Functions can still write to the sheet configured by `APPS_SCRIPT_URL`.** Use a copied spreadsheet and a separate deployment. Automated tests replace the sheet, email, and network; they do not access real data.

## Current flow

A client submits a commission and receives a private, read-only link. The artist changes status, client message, and review visibility in Sheets. Email recovery is queued and processed once a minute: recovery links last 15 minutes, and confirming one replaces access to that order. The admin area and public editing were removed.

Read [operations and publishing](docs/OPERATIONS-AND-PUBLISHING.md) before enabling the backend. Editing `apps-script/Code.gs` locally does not update the published Apps Script.

The [original plan](docs/ORDER-TRACKING-PLAN.md) records the decisions and validation checklist. A local implementation does not mean external services have already been migrated.

References: [Netlify Dev](https://docs.netlify.com/api-and-cli-guides/cli-guides/local-development/), [build configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/).
