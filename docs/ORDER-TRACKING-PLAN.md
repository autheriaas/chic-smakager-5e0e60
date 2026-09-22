# Plan: Google Sheets management and private order tracking

Date: 2026-09-22.

Implementation update: the paths described by the initial analysis below are historical. Public files are in `public/`, Apps Script is in `apps-script/Code.gs`, private helpers are in `server/`, and this plan is in `docs/`. `npm run build` generates `dist/`. The admin area and public editing were removed, and the new order flow was implemented locally. Node was updated to 24.21.0 and Netlify CLI to 27.8.0.

Status: implementation complete, with 13 backend tests and five Chromium tests passing. After configuring Apps Script and testing through Netlify Dev, the user confirmed that every flow worked and authorized the commit. The agent did not publish the site to Netlify. See `OPERATIONS-AND-PUBLISHING.md` for activation and operational limits. The checklist below was the original roadmap; implementation checks refer to local code, not a production deployment audit.

## Context and goal

The project is Claudia's art portfolio and commission site, presented as Claudia's Community / Autheria. The artist wants to manage orders and reviews directly in Google Sheets, without a website administration panel.

Visitors keep submitting commissions and can track only their own order using a private link. They do not receive an account, login password, editing, cancellation, or status-changing controls on the site. Questions and changes are handled directly with the artist.

The user approved the tracking and recovery flow below. Preserve the visual design, content, galleries, chatbot, and unrelated functionality. Do not migrate to another database or framework without a discussed need.

## Structure found during the initial analysis

- `index.html`: home page, mostly embedded CSS and JavaScript, commission form, reviews, and the prior lookup/edit flow.
- `terms.html`: terms and conditions.
- `admin/login.html` and `admin/index.html`: login and orders/reviews panel.
- `netlify/functions/admin-*.js`: login, session, logout, order listing, status change, and review deletion.
- `netlify/functions/reviews.js`: public review/statistics reads through Apps Script.
- `netlify/functions/chat.js` and `autheria-chatbot-widget.js`: chatbot; preserve.
- `Code.gs`: Google Apps Script code with spreadsheet and order/review routes.
- `netlify.toml`: initially published the repository root (`publish = "."`) and configured Functions/cache.
- `assets/`, `robots.txt`, `sitemap.xml`: public media and files.

No `package.json` was found during the initial inspection. Revalidate the structure and any `AGENTS.md` instructions before starting implementation.

### Evidence and limits of the initial analysis

- Administrative Functions checked a session before listing orders, changing status, and deleting reviews.
- Local tests without network access returned `401` for those operations without a session and for login without valid credentials; an invalid session was rejected.
- The code contained fallback credentials and secrets. Do not copy their values into documentation, logs, or new commits.
- The prior Apps Script could locate the latest order by name/email (`findOrder`), read by ID/email (`getOrder`), and edit by ID/email (`updateOrder`). This did not prove email ownership.
- The former form had a `no-cors` fallback that could report success without confirming storage and could repeat a submission.
- Production deployment behavior, environment configuration, spreadsheet permissions, and the published Apps Script version were not verified. Do not assume they match local files.
- It was not confirmed that server sources were public. Publishing the root was a risk to review, not proof of an exposure.

## Agreed product decisions

### Submission and tracking

1. The client sends the commission form.
2. The server stores the order and creates a readable identifier and a separate secret token.
3. The client receives an email button to track the order.
4. The page shows the number, commission type, status, public artist message, latest update, and contact.
5. The artist changes status and message directly in the spreadsheet.
6. The client's next lookup reflects those changes.

The tracking link works until it is revoked or replaced. It does not expire after 15 minutes. Anyone holding the link can read the order: it is an access credential even without login.

Do not expose email, unnecessary personal data, private references, internal notes, or the full spreadsheet row in a public response. Validate the token server-side and return explicitly allowed fields only.

### Tracking recovery

1. The client clicks “Recover tracking” and enters an email.
2. The interface always responds: “If orders are associated with this email, we will send access instructions.”
3. When an order exists, recovery is sent only to the registered address.
4. The recovery link is temporary, proposed at 15 minutes, and single-use.
5. Opening the link shows a confirmation. Only confirmation consumes the token and replaces access.
6. Confirmation creates a new tracking link and invalidates the previous link for that order.
7. Recovery-link expiry does not delete or expire the order; the client can request another link.

Do not confuse the temporary recovery token with the durable tracking token. Do not invalidate tracking merely because someone requested recovery. Do not consume tokens on GET, because email services may open links automatically.

For several orders associated with one email, allow order-by-order recovery without revealing the list in the public response. Send individual links/instructions for eligible orders while preserving that requirement.

### Review management

Preserve review submission and display. Add spreadsheet visibility control and calculate count/average from visible reviews. The artist can hide reviews without manual counter updates.

Review the relationship between `Stats`, `Ratings`, and `Reviews`: the code also had a `rating` action. Avoid double-counting or losing legacy reviews. If independent ratings are actively used, define their meaning before changing calculations.

## Implementation plan

### 1. Inspection and backup

- [x] Re-read current code and local instructions; check changes since this plan was created.
- [ ] Identify the active Apps Script version, Netlify configuration, and real spreadsheet schema when access is available.
- [ ] Back up before changing a spreadsheet or published service.
- [x] Do not overwrite orders, reviews, or user changes.

### 2. Remove administration and old editing

- [x] Remove `admin/` and administrative Functions without broken imports.
- [x] Remove admin-specific references and rules that are no longer needed.
- [x] Remove the “Already sent a request? Edit it” button, dialogs, handlers, and edit requests from `index.html`.
- [x] Remove legacy `getOrder`, `findOrder`, and `updateOrder` Apps Script operations.
- [x] Remove old administrative actions (`adminOrders`, `adminUpdateStatus`, `deleteReview`) replaced by direct spreadsheet management.
- [x] Reject unknown/removed actions explicitly. A former POST defaulted to order insertion; an old call must not accidentally create an order.
- [x] Remove fallbacks and document removal/rotation of old environment configuration.

### 3. Evolve the spreadsheet without destroying data

- [x] Preserve existing internal IDs; readable number and access token are distinct fields.
- [x] Add status values, client message, update date, and required technical fields.
- [x] Map existing values (`New`, `Contacted`, `In Progress`, `Done`) without losing meaning.
- [x] Protect technical columns from accidental editing; this does not replace spreadsheet access permissions.
- [x] Update the date automatically when relevant public fields are edited, including multi-row pastes.
- [x] Make the migration repeatable, without duplicate columns or records.
- [x] Allow recovery for legacy orders with valid email, without sending bulk email.

### 4. Implement a reliable server and submission path

- [x] Use Functions as the browser entry point; authenticate Apps Script communication using a dedicated environment/property secret.
- [x] Do not reuse old admin secrets. Missing configuration must block protected operations.
- [x] Generate cryptographically secure server tokens (secure Nano ID or equivalent); do not use `Math.random`, sequences, or client data as a secret.
- [x] Store token hashes only in the spreadsheet and avoid tokens in logs.
- [x] Validate types, sizes, and accepted fields; prevent inputs from becoming executable Sheets formulas.
- [x] Confirm storage before reporting success; remove opaque presumed-success behavior.
- [x] Add idempotency and Apps Script concurrency protection to avoid duplicate retries.
- [x] Send the tracking email and distinguish delivery failure from order-creation failure.
- [x] If an order was saved, never ask the user to resubmit merely because email failed.

### 5. Tracking page

- [x] Create a responsive page consistent with the site and its current English copy.
- [x] Show only agreed public fields, with no edit controls.
- [x] Reject invalid, old, or revoked tokens without exposing order data.
- [x] Prevent private-response caching and page indexing; avoid token leaks in referrers, analytics, and third-party resources.
- [x] Use a carefully chosen token transport, with a fragment link and request-body submission.
- [x] Do not load unnecessary integrations on the private page.

### 6. Recovery

- [x] Implement email recovery with a generic response, including an HTTP/result path that does not reveal registration.
- [x] Limit requests by origin/email and validation attempts; do not depend on one Function's in-memory counter.
- [x] Create a separate temporary token and store its hash, expiry, and consumption state.
- [x] Consume and rotate access atomically, preventing concurrent double use.
- [x] Invalidate previous tracking only after valid confirmation.
- [x] Give the client the new link and handle delivery/network failures without permanent loss of access.
- [x] Handle multiple orders per email, quotas, and mail failures.

### 7. Reviews

- [x] Add a visibility column and preserve the initial behavior of existing reviews.
- [x] Filter reviews and recalculate statistics according to the defined rule.
- [x] Ensure manual changes are reflected despite caching.
- [x] Validate submission and display without any dependency on the removed admin.

### 8. Organization and publishing

- [x] Separate public directory from server sources and `Code.gs`; adjust `publish` in `netlify.toml`.
- [x] Update asset, Function, chatbot, and page paths after reorganization.
- [x] Document Netlify variables, Apps Script properties, email authorization, and required triggers without recording secrets.
- [x] Prepare the Apps Script/Netlify publishing order so old reads are not left open and submissions are not inadvertently interrupted.
- [ ] Confirm in production that server files are not static and old routes no longer work.

## Acceptance criteria

- [x] A new order produces one row even when the same request is repeated.
- [x] The client receives access and can track only the authorized order.
- [x] An invalid/altered token returns no order information.
- [x] Visitor UI/API cannot edit, cancel, or change status.
- [x] Name/email alone cannot retrieve orders or tokens.
- [x] Spreadsheet status/message edits appear with a coherent date in tracking.
- [x] Valid recovery replaces only the corresponding order's access.
- [x] Expired, consumed, or concurrently reused recovery token is rejected.
- [x] Opening a link by GET does not consume recovery or revoke tracking.
- [x] Legacy orders and multiple orders per email are handled correctly.
- [x] Email failure creates neither a duplicate nor a false storage error.
- [x] A hidden review no longer appears and statistics follow the defined rule.
- [ ] Admin, old operations, and server sources are not improperly accessible in deployment.
- [x] Home, galleries, chatbot, terms, reviews, and mobile layout keep working.

Use fictitious data and mocks in local tests. Do not send real email, create client orders, or modify production data only for testing. Final sheet/email validation requires a defined test environment and recipient.

## Deliverables and resumption

Deliver code, spreadsheet migration, configuration/publishing instructions, and test evidence. Local changes to `Code.gs` do not update published Apps Script: that stage must be performed and verified separately.

When resuming, read this document, compare it with current files, verify access to services, and begin with inspection and backup. Access to Netlify, the Apps Script project, and spreadsheet was not assumed. Do not declare deployment complete based only on local validation.

## References consulted during planning

- OWASP, tokens and email recovery: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Google Apps Script service/email quotas: https://developers.google.com/apps-script/guides/services/quotas
- Google Apps Script MailApp: https://developers.google.com/apps-script/reference/mail/mail-app

Review current quotas and APIs when deploying. The 15-minute expiry is a project decision, not a Google-imposed limit.
