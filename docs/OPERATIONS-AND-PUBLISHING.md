# Order Tracking Operations and Publishing

## Delivery status

The implementation is local. This implementation did not alter a real spreadsheet, an Apps Script deployment, or a Netlify site. Tests use fictitious records and simulated email delivery. Validate the Google service in a spreadsheet copy before enabling production.

The user later configured Apps Script and confirmed the flows through Netlify Dev, including email recovery, before authorizing the implementation commit. The user made the Google changes; the agent did not publish the site to Netlify. The local suite currently has 18 passing tests.

## Preparing a test environment

1. Copy the original spreadsheet and save the currently published code/version. Confirm the copy has the expected sheets and records. Keep the spreadsheet private.
2. In the copy, open **Extensions > Apps Script**. Replace the code with `apps-script/Code.gs`. Remove old files that define another `doGet`, `doPost`, or obsolete operations.
3. In **Project Settings > Script properties**, set:

   | Property | Value |
   |---|---|
   | `BACKEND_SECRET` | A new random secret with at least 32 characters; use the same value in Netlify |
   | `SITE_URL` | HTTPS origin for the test environment, with no path, query string, or fragment |

   Generate the secret outside the code, for example: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Store it in a secret manager. Do not reuse old admin values or test fixtures.
4. Run `setup()` manually in the Apps Script editor with the account that owns the spreadsheet and sends mail. Authorize spreadsheet access, trigger management, and email sending. It does not send test or bulk email.
5. Confirm the `processRecoveryQueue` (every minute) and `onSheetEdit` (sheet edit) triggers exist. Running setup again avoids duplicates created by the same account. Review old triggers or triggers owned by other accounts and remove ones that must no longer run.
6. Deploy the web app as the responsible account and make it accessible to Netlify requests. Use its `/exec` URL. All handlers require the body secret.
7. Configure local `.env` or test-deployment variables: `APPS_SCRIPT_URL`, `BACKEND_SECRET`, and `SITE_URL`. `SITE_URL` must match the Apps Script property. Configure `GEMINI_API_KEY` separately if testing the chatbot.
8. Test with an email address you control: creation, email receipt, tracking, a status change, recovery, and hiding a review. Do not use client data.

Email links use the configured HTTPS origin. To open a test link in Netlify Dev, replace **only the origin** with `http://localhost:8888`, keeping `/track.html` and the fragment intact. Do not point a local experiment at the production spreadsheet.

## Migration and data preservation

`setup()` adds missing headers without deleting existing rows. It preserves existing IDs and creates readable numbers such as `ART-00001`. The `ORDER_SEQUENCE` counter is stored in Script Properties; do not remove it. Known statuses are mapped as follows:

| Previous | Current |
|---|---|
| New | Received |
| Contacted | Contacted |
| In Progress | In progress |
| Done | Completed |

The routine records `SPREADSHEET_ID` automatically from the bound spreadsheet. Web requests and queue processing open that spreadsheet explicitly by ID because active-context methods are unavailable in web apps. When copying the project to another spreadsheet, run setup in the copy to update this binding. See [Google documentation](https://developers.google.com/apps-script/guides/bound).

Custom legacy statuses are retained, but review them because the selector now uses the four statuses above. Do not reorder technical columns: token rotation assumes `AccessHash`, `RecoveryHash`, and `RecoveryExpires` remain adjacent in that order.

Legacy orders do not receive bulk email. If they have a valid email, they can be recovered from the tracking page. Blank `AccessEnabled` and `Visible` fields are initialized as true. Re-running the migration preserves unchecked boxes, numbers, and existing hashes.

## Daily management in Google Sheets

### Orders

- `Status`: current stage.
- `ClientMessage`: a message **public to the client for that order**. Do not put internal notes here.
- `LastUpdated`: updated automatically when Status, Type, or ClientMessage changes, including multi-row pastes.
- `AccessEnabled`: uncheck to block tracking and recovery. For permanent revocation before re-enabling, also clear AccessHash, RecoveryHash, and RecoveryExpires. Unchecking and rechecking alone re-enables a link whose hash remains.
- `MailState`: whether the first email was sent. Email failure does not mean the order was lost; use recovery instead of recreating it.

Do not edit `Id`, `Number`, hashes, RequestId, or Fingerprint. Protection warnings reduce accidental changes; they do not replace spreadsheet-sharing permissions. The spreadsheet owner can still edit technical cells. When sorting, select the entire table, never a single column.

Clients can see only number, type, status, ClientMessage, and update date. Name, email, budget, description, and references are excluded from tracking responses. Changes and cancellations are handled by contacting the artist.

### Reviews

Uncheck `Visible` to hide a review. The list and average are calculated from visible reviews directly; no manual counter adjustment is needed. Reload the page to fetch current data.

The old `Ratings` and `Stats` sheets are preserved as history. The prior implementation wrote the same star rating to both `Reviews` and `Ratings` without a reliable relationship between them. Adding both would double-count ratings. The new average uses **visible written reviews only**; standalone historical ratings remain archived and are not included. The current form requires written review text and does not offer a standalone rating.

## Recovery and limits

The request adds a row to `_RecoveryQueue` without looking up orders. Known and unknown addresses receive the same response. The trigger processes up to five requests per run and sends one email with individual links for every enabled order at that address.

Recovery tokens are cryptographically derived from a random identifier and the backend secret. Only hashes are stored in orders. The queue holds request ID, email, and state, never plaintext tokens. The 15-minute period starts when the worker prepares links. Opening a link does not consume it; the client must confirm. Confirmation uses an Apps Script lock to prevent double use and changes the three technical fields in one range write.

If the confirmation response is lost after the token is consumed, request another email. The old access may already have been replaced; recovery provides a new one. The link created after confirmation is shown for saving/copying; the token is not stored in browser storage and is removed from the address bar after it is read.

Persistent limits per one-hour window:

- Tracking reads: 120 per origin/IP.
- Recovery requests: 20 per origin/IP and 3 per email.
- Creation, confirmation, and reviews: 30 per operation and origin/IP.
- New orders: 5 per email.

The IP identifier is hashed with a Function secret, not stored as plaintext. `_RateLimits` retains current windows only, limited to 5,000 entries. Technical sheets are hidden. Rate limiting is a basic low-volume safeguard and does not replace infrastructure-level protection against large attacks.

Queue email failures are retried up to three times. Pending requests older than 30 minutes expire; queue records are removed after 24 hours. MailApp quotas depend on the account. Check trigger execution history and the `Pending`, `Processed`, `Failed`, and `Expired` states in the technical sheet. Do not enable logs containing tokens, secrets, or order payloads.

## Coordinated production publishing

1. Complete validation in the spreadsheet copy and prepare the Netlify build. For a new domain/site, configure the correct matching origins in both services.
2. Back up the production spreadsheet and current code. Plan a short maintenance window for forms: old and new backend versions are not compatible for submissions.
3. In the production Apps Script project, install the new code, configure a new secret and `SITE_URL`, run setup, and publish a **new version of the existing deployment**. This closes old operations at the known URL. Revoke other accessible old deployments; publishing a new endpoint alone does not close them.
4. Set the new Netlify variables and publish the new site, code, and Functions. Remove `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `ADMIN_DELETE_SECRET` from the environment; remove the obsolete `ADMIN_SECRET` Apps Script property. Keep chatbot configuration.
5. Confirm `/admin/` and `admin-*` endpoints are absent, old Apps Script actions are rejected, and `apps-script/`, `server/`, `docs/`, `.env`, and Function source are not public static files.
6. Make an authorized test order using a controlled email, validate the complete path, and check queue/triggers. Local tests alone are not production validation.

If something fails, temporarily disable forms/Functions and fix the issue while keeping old lookup routes blocked. Do not accidentally restore the old version that allowed lookup by name/email. Preserved data and the backup allow a controlled recovery.

## Local testing and troubleshooting FAQ

### Do I need to publish Apps Script to test against the real sheet?

Yes. Saving or running `Code.gs` in the editor does not update the deployed `/exec` web app. For code changes, create a new version of the existing deployment and update it. Run `setup()` when this is the first setup or the schema/properties changed; it is not required for every code-only fix. Prefer a copied sheet and a separate test deployment. Local Netlify Functions still call that remote Apps Script deployment.

### Where do `BACKEND_SECRET` and `SITE_URL` go?

Do not put either value in `Code.gs`. In the Apps Script editor, open **Project Settings > Script properties**, add the exact uppercase keys, and save them. Put the same values in local `.env` or Netlify environment variables. The secret must be new, random, and at least 32 characters long.

### Should `SITE_URL` be localhost during local testing?

No. Keep the canonical HTTPS site origin in both `.env` and Script Properties, for example `https://your-site.netlify.app`. The local site itself runs at `http://localhost:8888`. An email link can be tested locally by replacing only its origin with localhost. `APPS_SCRIPT_URL`, not `SITE_URL`, determines which remote Apps Script and spreadsheet are used.

### Which Apps Script deployment options should I select?

Deploy as a **Web app**, execute as **Me** (the account with spreadsheet and MailApp access), and choose **Anyone** for access, including users who are not signed in if that option is available. Netlify authenticates every request with `BACKEND_SECRET`; the sheet itself remains private. Copy the `/exec` URL into `APPS_SCRIPT_URL`. If a Workspace policy hides the required option, fix the policy rather than using a Google-login-only deployment.

### How do I run local development, and what if port 8888 is busy?

Run `npm run dev`, then open http://localhost:8888. Restart it after changing `.env`. If port 8888 is occupied, first stop the previous Netlify Dev terminal with Ctrl+C. To identify an unknown listener in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8888 -State Listen | Select-Object OwningProcess
Get-Process -Id <process-id>
```

Stop only the confirmed Netlify process with `Stop-Process -Id <process-id>`.

### Why did reviews return 502/503 or fail to load existing data?

This does not prove data was erased. Confirm `BACKEND_SECRET`, `SPREADSHEET_ID`, the latest `/exec` deployment, and its permissions. Run `diagnoseSetup()` in Apps Script for a read-only report of schema/property/sheet access. Public review reads no longer take the write lock. The browser waits up to 55 seconds and the server allows 50 seconds for Google, because a real Sheets read can be slow.

`UPSTREAM_TIMEOUT` returns 504. `UPSTREAM_NETWORK_ERROR`, `UPSTREAM_NON_JSON`, and `UPSTREAM_AUTH_REJECTED` return 502. `BACKEND_BUSY`, `SETUP_REQUIRED`, `SHEET_ID_MISSING`, and `SHEET_ACCESS_FAILED` return 503. Terminal logs contain only action, safe code, and elapsed time.

### Can recovery email be tested locally? What if the email arrives but the page reports an error?

Yes. Local Netlify Dev calls the remote Apps Script, so use a controlled recipient and an enabled order. The request is queued; allow the minute trigger to run, then check spam, trigger history, and queue state. A recovery link expires 15 minutes after preparation. To test it locally, replace only the link origin, confirm it, and save the newly displayed tracking link.

If the email arrived but the browser reported that the service could not confirm the request, the queue may have received the request while the acknowledgement was delayed or lost. Use the received link before it expires. Do not repeatedly submit different recovery requests; the browser reuses the same RequestId until success, and the backend deduplicates that queued request for up to 24 hours. If confirmation itself was consumed but its response was lost, request a new recovery email.

### What is the difference between a tracking and a recovery link?

The tracking link remains valid until revoked or replaced. A recovery link lasts 15 minutes and is single-use only after explicit confirmation. Requesting recovery alone does not invalidate the existing tracking link.

### Where did the spreadsheet sheet navigation go?

`setup()` hides only `_RateLimits` and `_RecoveryQueue`. Use the Sheets menu to show hidden sheets if needed. `Orders` and `Reviews` are not hidden by setup. If the whole tab bar is absent, reset browser zoom and reload before changing the spreadsheet.

`npm test` runs mocked Apps Script and Function tests. `npm run test:browser` starts a fixture server on port 8899 and uses Chromium with intercepted endpoints; no real email is sent. Screenshots are written to `reports/`, outside Git. `npm run build` generates only public content in `dist/`.

Mocks do not prove permissions, quotas, triggers, headers, or real Google/Netlify email delivery. Those checks remain required in the test environment.

References: [Apps Script Lock](https://developers.google.com/apps-script/reference/lock/lock), [spreadsheet protections](https://developers.google.com/apps-script/reference/spreadsheet/protection), [quotas](https://developers.google.com/apps-script/guides/services/quotas), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).
