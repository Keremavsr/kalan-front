# kalan API contract v0.3.0

Changes from v0.2.0: encrypted PDFs (`password` / `remember_password` on `POST /statements`, `/pdf-passwords`);
save gate (422 `save_blocked`, `review` on statements, see "Save gate"); `POST /diagnose`; rule-based categories and
cleaner `merchant` names (`/category-rules`, see "Categories"). Every v0.2.0 route and field is unchanged;
`needs_review` is now also set by soft save-gate findings, not only by the AI fallback.

Changes from v0.1.1: AI fallback reader and `needs_review` on statements, `POST /statements/{id}/template-draft`
(see "Statements"); CSV/OFX/QIF imports (`source: "import"`); `POST /simulate/installment`; `GET /alerts`;
fixed costs (`/fixed-costs`, schedule `fixed` series). Every v0.1.1 route and field is unchanged.

Back end: `kalan-back` (Python, FastAPI). Listens on `127.0.0.1:8765` only. JSON, UTF-8.
Front end: `kalan-front` (separate repo) talks to it only over HTTP. Base URL configurable (`VITE_KALAN_API`, default `http://127.0.0.1:8765`).
All money values are **integer minor units** (kuruş/centavos) plus `currency` (ISO 4217). Dates are ISO `YYYY-MM-DD`. Months are `YYYY-MM`.
Errors: `{"error": {"code": "string_code", "message": "human text", "details": {}}}` with a fitting HTTP status.
Codes used besides those listed per endpoint: `validation_error`, `not_found` (category rules), `job_not_found`,
`analysis_not_found`, `transaction_not_found`, `import_not_found`, `not_manual`, `unknown_provider`,
`invalid_installment`; uploads also return `not_pdf`, `invalid_pdf` and `parse_error`.
CORS exposes `X-Kalan-Password-Remembered`, `X-Kalan-Skipped-Rows` and `Content-Disposition` to the front end.

## Health and setup
- `GET /health` -> `{"status":"ok","version":"0.1.0"}`
- `GET /providers` -> `{"providers":[{"id":"claude-cli|codex-cli|agy-cli|gemini-cli|openai-compatible|local","name":"Claude Code","available":true,"detail":"claude 2.x found on PATH"}], "selected":"claude-cli"|null}`
- `PUT /providers/selected` body `{"id":"codex-cli"}` -> same as GET.
- `GET /settings` / `PUT /settings` -> `{"locale":"tr|en","base_currency":"TRY","months_ahead":12}`

## Statements
- `POST /statements?ai_fallback=true|false` multipart `file` (PDF, max 10 MB). Redacts, detects the bank parser or
  template, parses, stores. -> 201 `Statement`. 409 `duplicate` if same bank+card_last4+period already stored.
  Encrypted PDFs (v0.3.0): optional multipart form fields `password` (max 200 characters) and
  `remember_password=true|false`. Without `password` kalan tries the passwords remembered in the OS keyring.
  - 422 `pdf_password_required`: encrypted and no password given (or no remembered one opens it).
  - 422 `pdf_password_wrong`: the given password does not open it.
  Both carry `details.hints` = `[{"bank":"garanti","hint":"last 6 digits of your national ID"}]` from the bank
  templates (the bank is unknown until the PDF opens, so every hint is listed). With `remember_password=true` and a
  `password` that opened a statement read by a bank parser or template, the password is stored in the OS keyring for
  that statement's `bank`; the 201 response then has header `X-Kalan-Password-Remembered: true|false` (`false`: no
  keyring, or the statement was read by the AI fallback). The password never reaches SQLite, a log or a response.
  When no parser or template matches (v0.2.0):
  - `ai_fallback=true` (default) and a provider is selected and available: the redacted page text goes to that
    provider, which transcribes it into strict JSON (header fields, rows, printed totals). Code turns it into a
    `Statement` with `parser_id: "ai-fallback"`, builds the installment plans and runs the same reconciliation.
    `needs_review: true` when it does not reconcile. The request waits for the model (up to 180 s, one retry on
    invalid JSON). 502 `ai_fallback_failed` if the provider fails or answers invalid JSON twice. The redacted text
    of such a statement is kept (deleted with the statement) for `template-draft`.
  - otherwise 422 `unknown_format` with `details.ai_fallback` = `"off"`, `"no_provider"`, `"provider_unavailable"`
    or `"too_long"` (more than 60 000 characters).
- `POST /statements/{id}/template-draft` (v0.2.0, AI-fallback statements only) -> 200
  `{"provider","yaml":"...","valid":true,"errors":[],"detect":true,"parse_error":null,"reconciliation":Reconciliation|null}`:
  the model drafts a YAML bank template from the kept text; code validates it against the template schema and runs it
  on the same text. `valid:false` with `errors` if the draft still does not validate after one retry. 409
  `no_statement_text` for a statement that was not read by the fallback, 409 `no_provider` / `provider_unavailable`,
  502 `provider_failed`. Synchronous like the fallback.
- `GET /pdf-passwords` (v0.3.0) -> `{"keyring":true,"items":[{"bank":"garanti","hint":"text"|null,"remembered":false}]}`,
  one item per known bank; never a password.
- `PUT /pdf-passwords/{bank}` (v0.3.0) body `{"password":"..."}` -> 204. 404 `unknown_bank`, 503 `keyring_unavailable`.
- `DELETE /pdf-passwords/{bank}` (v0.3.0) -> 204. 404 `not_remembered`.
- `GET /statements` -> `{"items":[StatementSummary]}` newest first.
- `GET /statements/{id}` -> `Statement`
- `DELETE /statements/{id}` -> 204

`StatementSummary`:
```json
{"id":"st_01","bank":"vakifbank","product":"Worldcard","card_last4":"0000","period_start":"2026-08-26","period_end":"2026-09-25",
 "due_date":"2026-10-05","currency":"TRY","statement_total":0,"minimum_payment":0,
 "reconciliation":{"status":"ok|mismatch","expected":123456,"computed":123456,"difference":0},
 "analysis_status":"none|pending|done|failed","needs_review":false,
 "review":[{"code":"reconciliation_mismatch","severity":"soft","message":"text","details":{"difference":-1}}]}
```
`review` (v0.3.0) lists the soft save-gate findings; empty for a clean statement.

### Save gate (v0.3.0)
Before `POST /statements` stores a parsed statement, code checks it. A **hard** finding blocks the save: 422
`save_blocked` with `details.issues` = `[GateIssue]` (all findings, hard and soft); a duplicate keeps the v0.2.0
answer, 409 `duplicate` with `details.statement_id`. Only **soft** findings: saved with `needs_review: true` and the
findings in `review`. `GateIssue` = `{"code","severity":"hard|soft","message","details":{}}`.

| Code | Severity | Meaning, `details` |
|------|----------|--------------------|
| `duplicate_statement` | hard | Same bank + card + period (or id) already stored (answered as 409 `duplicate`). `statement_id` |
| `period_invalid` | hard | Period starts after it ends. `period_start`, `period_end` |
| `due_before_cut_off` | hard | Due date before the cut-off date. `period_end`, `due_date` |
| `no_transactions` | hard | No rows read but the total is not zero. |
| `amount_scale` | hard | A total and its rows differ by a factor of 10, 100 or 1000 (decimal separator read wrong). `checks`, `factor` |
| `period_unusual` | soft | Period shorter than 20 or longer than 45 days. `days` |
| `not_reconciled` | soft | No reconciliation was run. |
| `reconciliation_mismatch` | soft | Rows do not add up to the printed totals. `difference`, `checks` (failed check names) |
| `no_printed_summary` | soft | No totals block found; only `statement_total` was checked. |
| `rows_after_cut_off` | soft | Rows dated more than 3 days after the cut-off. `count` |
| `minimum_above_total` | soft | Minimum payment larger than the statement total. |
| `installment_counter` | soft | A row's installment number, plan length and remaining count disagree. `transaction_ids` |
| `installment_sequence` | soft | A plan's installment number does not follow the previous stored statement's (same card, at most 3 billing cycles back; the expected number counts the cycles between, so statements can be uploaded in any order). `plan_ids`, `previous_statement_id`, `cycles` |
| `installment_missing` | soft | A plan still running in the previous stored statement is absent (early payoff, or a row not read). A plan with fewer installments left than the cycles between has ended and is not reported. `plan_ids`, `previous_statement_id`, `cycles` |
`Statement` = `StatementSummary` + `"transactions":[Transaction]` + `"interest_rates":{"purchase_monthly":"3.25", ...}` (strings, as printed)
+ `"parser_id":"tr_vakifbank_worldcard|<template id>|ai-fallback"` and optional parsed extras (`credit_limit`,
`next_period_end`, `next_due_date`, `printed_summary`, `page_count`).
`currency` is any ISO 4217 code; minor units follow ISO 4217 (JPY 0 decimals, KWD 3, most currencies 2).

`printed_summary` (the bank's own totals block, signed as debt: positive = owed) or `null`:
```json
{"previous_balance":123456,"period_transactions":999999,"interest_and_fees":1234|null,"payments":123456,
 "statement_total":999999,"remaining_installments":456789|null}
```
`interest_and_fees` is `null` when the bank prints no separate fee line and counts interest and fees inside
`period_transactions` (Yapı Kredi). `remaining_installments` is the printed total of installments still to come
after this statement, `null` when the bank does not print it.

`Transaction`:
```json
{"id":"tx_01","date":"2099-01-15","description":"ORNEK MARKET 1.Taksit","amount":123456,"currency":"TRY",
 "direction":"debit|credit","kind":"purchase|installment|cash_advance|fee|tax|interest|payment|refund|carry_over|other",
 "installment":{"remaining_count":2,"remaining_amount_each":123456,"is_last":false,"plan_id":"pl_01",
                "index":1|null,"total_count":3|null,"component":"principal|bsmv|kkdf|interest|early_payoff|null"}|null,
 "category":"groceries|null","merchant":"normalized merchant or null","source":"statement|manual|import",
 "original_amount":1234|null,"original_currency":"USD|null","points":"12,34|null","detail":"text|null"}
```
`original_amount` / `original_currency`: the foreign amount of a charge made in another currency. `points`: the
loyalty points cell as printed. `detail`: sub-lines the bank prints under a row (bill reference, installment note,
exchange note), joined with ` | `, redacted like the rest of the text; never rows of their own.

## Categories (v0.3.0)
`merchant` is the cleaned merchant name: payment-processor prefixes (`IYZICO*`, `PAYTR *`, `PAYPAL *` ...), `*`,
store and terminal numbers, and trailing country codes, cities and districts are removed
(`IYZICO*ORNEK KAFE 000123 ISTANBUL TR` -> `ORNEK KAFE`). Installment plan ids do not depend on it.

Uploaded statements and imports get a `category` from rules before they are stored: the user's rules first, then
the transaction kind (`fee`/`interest` -> `fees`, `tax` -> `taxes`, `cash_advance` -> `cash`, `payment` ->
`transfers`, `carry_over` -> `other`), then the built-in phrases (`src/kalan/categories.yaml`, Turkish merchants
first). Phrases match whole words of the merchant name after folding (case, diacritics, Turkish I); the longest
match wins. What no rule covers stays `null`; `POST /statements/{id}/analyze` asks the model only for those and
never overwrites a category a rule set.
- `GET /category-rules` -> `{"items":[{"id":"cr_01","pattern":"ORNEK KAFE","category":"dining","created_at":"..."}],
  "categories":["groceries","dining",...]}` (user rules, oldest first; `categories` is the allowed list).
- `POST /category-rules` body `{"pattern":"ORNEK KAFE","category":"dining","apply":true}` -> 201
  `{"rule":{...},"applied":3}`. With `apply` (default) every stored statement and import row the user did not
  categorise by hand is recategorised by the user rules; `applied` counts changed rows. 409 `duplicate_rule`
  (`details.rule_id`) for the same pattern after folding, 422 `invalid_pattern` (no letters or digits), 422
  `validation_error` for a category outside the list.
- `DELETE /category-rules/{id}` -> 204 (categories it set stay), 404 `not_found`.

## Diagnosis (v0.3.0)
- `POST /diagnose` multipart `file` (PDF, max 10 MB), optional form field `password` -> 200
  `{"report":DiagnosisReport,"text":"plain-text report for an issue form"}`. Nothing is stored. Same errors as the
  upload: 413, 415 `not_pdf`, 422 `pdf_password_required` / `pdf_password_wrong` / `invalid_pdf`.

`DiagnosisReport` holds the statement's structure only. Each line is a shape: digits -> `9`, lower-case letters ->
`a`, upper-case -> `A`, punctuation and single spaces kept, a run of 3+ spaces -> `<N sp>`. No text or amount survives.
```json
{"kalan_version":"0.1.0","page_count":3,"has_text":true,"line_count":132,"lines_per_page":[100,26,6],
 "number_styles":{"1.234,56":39,"1,234.56":0,"1 234,56":0},
 "date_styles":{"DD.MM.YYYY":0,"DD/MM/YYYY":0,"YYYY-MM-DD":0,"DD.MM.YY":0,"D Month YYYY":13},
 "templates":[{"id":"tr_garanti_bonus","detected":true,"anchors":{
    "detect_all":{"found":5,"total":5,"missing":[]},"detect_none_present":[],
    "header_fields":{"statement_total":true,"due_date":true},"table_header":{"found":5,"total":5,"missing":[]},
    "table_end":true,"summary_title":true}}],
 "shapes":[{"page":1,"shape":"Aaaaa Aaaaaa","repeat":1},{"page":1,"shape":"9.999,99 AA","repeat":2}],
 "shapes_truncated":false}
```
`anchors` (template parsers only) names kalan's own template phrases that were found or missing; `has_text:false`
means a scanned image without a text layer. At most 600 shapes; consecutive equal shapes are merged with `repeat`.
The Python entry point is `kalan.diagnose.diagnose(path_or_bytes, password=None) -> dict` (`as_text(report)` for
the plain-text form). The issue form `.github/ISSUE_TEMPLATE/bank-not-supported.yml` asks for the `text`.

## Imports (v0.2.0)
- `POST /imports` multipart `file` (CSV, OFX/QFX or QIF, max 10 MB), optional form fields `format` (`csv|ofx|qif`,
  default: sniffed from name and content) and `mapping` (JSON string, every key optional):
  `{"date","description","amount","debit","credit","installment","currency_column"` (column names, matched ignoring
  case and accents), `"currency":"BRL","delimiter":";","decimal":",","date_format":"DD/MM/YYYY","sign":"negative_debit|positive_debit","template":"<template id>"}`.
  Everything not given is detected: delimiter, header row and columns (names in en/pt/es/tr/he), number format, date
  order (day-first wins when every day is <= 12; `date_ambiguous: true` then), and which sign is a charge (the
  majority sign of the amount column). OFX/QIF: a negative amount is a charge. Installment hints come from the
  installment column or the description (`3/10`, `parcela 3 de 10`, `cuota 3 de 6`); `template` applies that
  template's kind and installment rules instead of the generic ones. Descriptions are redacted before storing.
  -> 201 `{"id":"im_..","format","currency","rows":5,"imported":5,"skipped_duplicates":0,"months":["2026-02"],
  "detected":{"delimiter",";","decimal":",","amount_format","date_format","date_ambiguous","sign","columns":{...}},
  "transactions":[Transaction]}` (only the newly stored rows). A row already stored by an earlier import (same date,
  description, amount and currency, or same OFX FITID) is skipped. 422 `import_unreadable` (message says why),
  422 `invalid_mapping`, 413 `file_too_large`.
- `GET /imports` -> `{"items":[{"id","format","created_at","currency","detected","months","rows","imported","skipped_duplicates"}]}` newest first.
- `DELETE /imports/{id}` -> 204, removes its rows.

Imported rows appear in `GET /transactions` (`source=import` filters), the monthly summary and subscriptions.
Imported installment rows with `k/n` become plans in the schedule with `"source":"import"` (one plan per item,
however many months were imported). Do not import a period you also uploaded as a PDF: both would count.

## Manual entry
- `POST /transactions` body: `{"date","description","amount","currency","direction","installment":{"total_count":6,"amount_each":50000}|null}` -> 201 `Transaction` (`source:"manual"`).
- `GET /transactions?month=2026-09&source=manual|statement|import` (both filters optional) -> `{"items":[Transaction]}`, by date.
  `month` is the statement month a row belongs to (the month of its statement's `period_end`); manual and imported
  rows use the month of their own date. A statement row dated 28 Sep on a statement ending 25 Oct is in `2026-10`.
- `DELETE /transactions/{id}` (manual only) -> 204

## Fixed costs (v0.2.0)
- `POST /fixed-costs` body `{"name":"Rent","amount":1500000,"currency":"TRY"|null,"day":1-31,"start":"2026-01","end":"2026-12"|null,"category":null}`
  -> 201 `FixedCost` (same fields plus `id`; `currency` defaults to the base currency; `day` is clipped to short
  months; `end` is inclusive). 422 `invalid_period` if `end` is before `start`. The name is redacted.
- `GET /fixed-costs` -> `{"items":[FixedCost]}`. `DELETE /fixed-costs/{id}` -> 204, 404 `fixed_cost_not_found`.

## Calculations (computed by code, never by the model)
- `GET /installments/schedule?months=12` ->
```json
{"currency":"TRY","months":[{"month":"2026-11","total":411000,"items":[{"plan_id":"pl_01","description":"...","amount":373011,"index":2,"count":3}]}],
 "plans":[{"plan_id":"pl_01","description":"...","kind":"purchase|cash_advance","remaining_count":2,"amount_each":373011,"ends":"2026-12","total_remaining":746022}]}
```
Each plan also has `"source":"statement|manual|import"`. Every schedule item and every plan also carries `"breakdown":{"principal":int,"interest":int,"bsmv":int,"kkdf":int}` or `null`
(null for plain purchases; for a cash advance the four parts of that month / of the remaining total, summing to `amount` /
`total_remaining`).
- The schedule also carries `"fixed":{"kind":"fixed","months":[{"month","total","items":[{"fixed_cost_id","name","amount","currency","date"}]}]}`
  (v0.2.0) over the same months: recurring fixed costs, never added to `months[].total`. `fixed.months[].total`
  sums only items in the schedule currency.
- `GET /summary/monthly?month=2026-09` -> always 200 (a month with no data returns zeros, empty `by_category` and empty `statement_ids`, never 404) `{"month","currency","total_spend","total_credit","by_category":[{"category","amount","share":"0.18"}],"previous_month":{"total_spend","change":"0.12"}|null,"statement_ids":[...]}`
- `GET /subscriptions` -> `{"items":[{"merchant","amount_last","amount_previous","currency","months_seen":["2026-08","2026-09"],"price_change":"0.20"|null}]}` (recurring = same normalized merchant in >= 2 consecutive months with amounts within 25% or flagged by the model).

- `POST /simulate/installment` (v0.2.0) body `{"amount":120000,"count":6,"start_month":"2026-12","interest_monthly":"3.11"|null,"months":null}`
  -> `{"currency","purchase":{"amount","count","start_month","interest_monthly","installments":[{"month","amount","principal","interest"}],
  "total_cost","interest_total","ends"},"months":[{"month","without","purchase","with"}],"peak":{"without":{"month","total"},"with":{"month","total"}}}`.
  `without` is the current schedule (`GET /installments/schedule`), `with` adds the purchase. No interest: equal
  installments, the division remainder in the first. With `interest_monthly` (percent per month): equal annuity
  payments, interest on the open balance, the last installment closes it exactly. A peak tie goes to the earlier month.
  Nothing is stored.

## Alerts (v0.2.0, computed by code)
- `GET /alerts` -> `{"items":[{"id":"al_..","kind","severity":"info|warning|critical","month":"YYYY-MM",
  "message_key":"alert.<kind>","params":{...},"refs":{"statement_ids":[],"transaction_ids":[],"plan_ids":[]}}]}`,
  sorted critical first, then by month. Ids are stable while the data does not change. "This period" is the latest
  statement of each card (bank + last four digits). The front end translates `message_key` with `params`.

| kind | severity | params | when |
| --- | --- | --- | --- |
| `installment_ending` | info | description, amount_each, currency, kind | a plan's last installment is in the next statement month (schedule `start_month`) |
| `limit_high` | warning, critical at >= 100% | used_share ("0.86"), statement_total, credit_limit, currency | statement total above 80% of the printed limit |
| `interest_charged` | warning | count, total, currency | interest rows this period |
| `fee_charged` / `tax_charged` | info | count, total, currency | fee / tax rows this period |
| `foreign_currency` | info | count, currencies, total, currency | rows with an original foreign amount this period |
| `missing_statement` | warning | bank, card_last4 | a month missing between two stored statements of a card |
| `subscription_price_rise` | info | merchant, amount_previous, amount_last, price_change, currency | a subscription's last charge is higher than the one before |
| `due_soon` | warning, critical at <= 1 day | due_date, days_left, statement_total, minimum_payment, currency | due date within 5 days and a balance is owed |
| `statement_overdue` | warning | bank, card_last4, expected_cut_off, days_overdue | a card's next statement (printed next cut-off, else the same day next month) is more than 7 days past its cut-off and not uploaded |
| `charged_after_cancel` | critical | merchant, cancelled_on, count, total, currency | a debit from a subscription marked cancelled (`/insights/cancelled-subscriptions`), dated after the cancellation |

## Model analysis (one call per statement)
- `POST /statements/{id}/analyze` -> 202 `{"job_id":"job_01","status":"pending"}`
- `GET /jobs/{job_id}` -> `{"status":"pending|done|failed","error":null}`
- `GET /statements/{id}/analysis` -> `{"categories_applied":true,"commentary":{"locale":"tr","summary":"text","watch_items":[{"title","detail","transaction_ids":[...]}]},"provider":"claude-cli","created_at":"..."}`

What is sent to the model: only date, description, amount, currency, kind per transaction plus code-computed totals. Never card number, name, address, IBAN, customer number.
The AI fallback and template draft send the statement's page text after redaction (card number, name, address, IBAN,
national id, phone, e-mail and long numbers removed), redacted a second time just before sending.

## Insights (task 5b, computed by code)
Routes under `/insights`. Every function behind them is a plain Python function in `kalan.insights.*` (named per
route below), so the CLI and an MCP server can call it too. Rates and legal limits come from dated data files in
`src/kalan/insights/data/` (each value with its source URL and check date); nothing leaves the machine except the AI
prompt the user copies or sends themselves.

### Rules and overrides
- `GET /insights/rules` -> `{"rules":{...tr_card_rules.json...},"overrides":{"contractual_monthly","late_monthly","bsmv","kkdf","minimum_ratio"}}`
  (unset overrides are `null`).
- `PUT /insights/rules` body: any of the override fields (rates as percent per month `"3.08"`, shares as fractions
  `"0.15"`) -> same as GET. The body replaces all overrides; `{}` clears them. 422 on a malformed value.
  Precedence everywhere: override, then what the statement prints (rate capped at the TCMB maximum for the date,
  printed minimum payment), then the data file.

### If I pay only the minimum (`kalan.insights.minimum.minimum_payment_plan`)
- `GET /insights/minimum-payment?statement_id=<id>&include_installments=false&cycles=<n>` (default: latest
  statement, all cycles) ->
```json
{"statement_id","currency","start_balance":100000,
 "minimum_only":{"cycles":38,"paid_off":true,"last_payment_cut_off":"2102-02-15","total_paid":118000,"interest":13846,"bsmv":2077,"kkdf":2077,"cost":18000,"balance_left":0},
 "pay_in_full":{"total_paid":100000,"cost":0},"extra_cost":18000,
 "rates":{"contractual_monthly":[{"from_cycle":1,"monthly":"3.08","source":"override|statement|rules","detail":null}],
          "bsmv":{"value":"0.15","source":"rules","detail":null},"kkdf":{...},"minimum_ratio":{"value":"0.20","source":"rules|statement|override|assumption","detail":"..."}},
 "assumptions":[{"key":"minimum_paid_on_time","text":"..."}],
 "cycles":[{"cycle":1,"cut_off":"2099-01-15","balance":100000,"payment":20000,"unpaid":80000,"days":31,"interest":1653,"bsmv":248,"kkdf":248,"added":0,"next_balance":82149}]}
```
  Each cycle pays the minimum (the printed one first, then `ratio` x the new total, rounded up); the unpaid part
  carries contractual interest `unpaid x rate/100 x days/30` for the real days between cut-offs; BSMV and KKDF are
  shares of the interest. `include_installments=true` adds the scheduled installments of each month (`added`).
  409 `no_statements`, 404 `statement_not_found`. Stops after 600 cycles (`paid_off:false`, `balance_left`).

### Card fee refund letter (`kalan.insights.card_fee.find_card_fees`, `refund_letter_prompt`)
- `GET /insights/card-fees` -> `{"items":[{"transaction_id","statement_id","date","description","amount","currency","bank","product","card_last4","statement_period_end","supplementary_card":false,"refunded":false}]}`
  newest first: fee rows whose description names an annual card / membership fee (`aidat`, `yıllık kart ücreti`,
  `üyelik ücreti`), never BSMV/KKDF or interest lines. `refunded` when a credit fee line of the same amount appears on
  the same card.
- `GET /insights/card-fees/{transaction_id}/prompt` -> `{"fee",...,"route":"hakem_heyeti|consumer_court","hakem_heyeti":{"year":2026,"limit_below":18600000,"currency":"TRY","source","apply"},
  "legal_basis":[{"id","title","summary","source","verified"}],"placeholders":["[AD SOYAD]","[TC KİMLİK NO]",...],"prompt":"...","note"}`.
  The prompt asks the user's AI for a refund request to the bank and a Hakem Heyeti (or consumer court) application,
  with personal fields left as placeholders. `route` compares the fee with the current Hakem Heyeti limit
  (`data/tr_consumer_law.json`). 404 `card_fee_not_found`.
- `POST /insights/card-fees/{transaction_id}/draft` -> `{"provider","text","route","placeholders_kept":[...],"placeholders_missing":[...]}`:
  sends that prompt to the selected provider and returns its text. Nothing is stored. 409 `no_provider` /
  `provider_unavailable`, 502 `provider_failed`.

### Which card for installments today (`kalan.insights.which_card.card_options`)
- `GET /insights/which-card?date=YYYY-MM-DD` (default today) -> `{"date","best":Card|null,"cards":[Card],"assumptions":[{"key","text"}]}`,
  `Card` = `{"bank","product","card_last4","statement_id","cut_off","cut_off_day","due_offset_days","due_date","due_date_effective","shifted_days","interest_free_days","days_until_cut_off","first_installment_month","basis":"printed|projected","stale":false}`.
  One entry per card (latest statement of each bank + last four). A purchase on `date` is billed on the first cut-off on
  or after it (the printed next cut-off and due date when the statement has them, else the same day of the month,
  clipped in short months, and the same cut-off-to-due gap). `due_date_effective` moves a weekend or public holiday to
  the next business day (`data/tr_holidays.json`); `interest_free_days` counts from `date` to it. Sorted by
  `interest_free_days`, most first.

### Shareable installment load card (`kalan.insights.share_card.load_card`, `load_svg`)
- `GET /insights/share-card?locale=tr|en&amounts=false` -> `{"locale","show_amounts":false,"sentence":"...","months":[{"month":"2099-01","share":"1.00"}],"svg":"<svg ...>"}`
  over the next 12 schedule months (same window as `GET /installments/schedule?months=12`). `share` is the month's
  installment total relative to the busiest month. With `amounts=true` each month also has `total`, the response has
  `currency`, and the sentence and bars show rounded amounts. The card never contains merchant names, plan
  descriptions, bank names or card numbers; the SVG uses system fonts only and loads nothing from the network.
- `GET /insights/share-card.svg?locale=tr|en&amounts=false` -> the same SVG as `image/svg+xml` (1200 x 630).

### Open period and next statement forecast (`kalan.insights.forecast.next_statement_forecast`, `backtest`)
- `GET /insights/forecast?include_fixed=true` ->
```json
{"open_period":{"from":"2099-05-16","to":"2099-05-25","transactions":[Transaction],"debit_total":35000,"credit_total":0},
 "forecast":{"month":"2099-06","currency":"TRY","total":144999,
   "parts":{"installments":10000,"subscriptions":4999,"variable":30000,"fixed":100000},"include_fixed":true,
   "variable_basis":{"months":["2099-01","..."],"median":30000,"known_in_month":0},
   "installment_items":[ScheduleItem],"subscriptions":[{"merchant","amount"}]},
 "backtest":{"currency","count":3,"mae":20000,"mape":"0.36","bias":-20000,"min_history":2}}
```
  The forecast month is the one after the latest cut-off. `open_period` lists manual and imported rows dated after
  that cut-off. Parts: installments already scheduled for the month, the last amount of every subscription seen in
  the latest month, fixed costs due that month (counted in `total` only with `include_fixed=true`, since they may not
  be paid by card), and `variable` = the median of the other spend (spend minus installment and subscription rows) of
  up to 6 earlier months, at least what is already known for the month. Spend follows the monthly summary rule.
- `GET /insights/forecast/backtest?include_fixed=true&history=6&min_history=2` -> the same summary plus
  `"months":[{"month","forecast","actual","error","parts"}]`: every past statement month with at least `min_history`
  earlier statement months is forecast from earlier data only. `mae` mean absolute error (minor units), `mape` mean
  of |error| / actual over months with spend, `bias` mean signed error (positive = forecast too high); all `null`
  when no month qualifies.

### Early payoff (`kalan.insights.early_payoff.payoff`, `payoff_overview`, `closed_early`)
- `GET /insights/early-payoff` -> `{"currency","start_month","plans":[Payoff],"closed_early":[{"plan_id","statement_id","month","transaction_id","index","total_count"}]}`:
  every open plan paid off in the first schedule month, and plans a statement already shows as closed before their
  last installment (an `early_payoff` row, or a row marked last below the plan length).
- `GET /insights/early-payoff/{plan_id}?month=YYYY-MM` (default: first schedule month) -> `Payoff` =
  `{"plan_id","description","kind","source","currency","payoff_month","remaining_count","amount_each","remaining_total","discount_rule":"unknown","note",
  "breakdown":{"principal","interest","bsmv","kkdf"}|null,"remaining_principal":int|null,"would_save_if_future_interest_dropped":int|null,
  "schedule_effect":[{"month","without","with"}]}`. Installments before `month` are billed as usual; all later ones
  are billed together in `month`. kalan knows no bank's payoff discount: `remaining_total` is the plain remaining
  amount; for a cash advance with a printed split, `remaining_principal` is what it would be if the bank dropped the
  future vade farkı, BSMV and KKDF. A purchase plan has no separate interest (`remaining_principal` =
  `remaining_total`). 404 `plan_not_found`, 422 `month_outside_schedule`.

### Cancelled subscriptions and fixed-cost matching (`kalan.insights.cancellations`, `kalan.insights.fixed_match.fixed_cost_report`)
- `GET /insights/cancelled-subscriptions` -> `{"items":[{"merchant","cancelled_on"}]}`.
- `POST /insights/cancelled-subscriptions` body `{"merchant":"ORNEK MUZIK","cancelled_on":"2099-02-28"}` -> 201 the
  full list. Same merchant (ignoring case and accents) replaces the earlier entry; the name is redacted. Feeds the
  `charged_after_cancel` alert (merchant matched inside the normalized row merchant, ignoring case and accents).
- `DELETE /insights/cancelled-subscriptions?merchant=...` -> 204, 404 `cancellation_not_found`.
- `GET /insights/fixed-costs/matches` -> `{"tolerance":{"amount":"0.075","days":2},"costs":[{"fixed_cost_id","name","amount","currency","day",
  "matches":[{"fixed_cost_id","month","transaction_id","date","amount","amount_diff","day_diff"}],"missing_months":["2099-02"]}],
  "duplicates":[{"fixed_cost_ids":["fc_a","fc_b"],"same_name":true,"amount_diff":40000,"day_gap":1}]}`.
  A debit row (not an installment, same currency) matches a fixed cost when its amount is within 7.5 % and its date
  within 2 days of the fixed cost's day (clipped in short months, across month ends). One row per fixed cost per
  month, closest date then closest amount. `missing_months` are active months strictly between the first and the
  last month with any data that have no match. Duplicates: overlapping periods, amounts within 7.5 %, days within 2.
  The forecast uses these matches so a fixed cost paid by card is counted once.

### Export (`kalan.insights.export.export`)
- `GET /insights/export?format=hledger|beancount|ofx|csv&what=transactions|plans&currency=TRY` -> the file as text
  (`text/plain`, `application/x-ofx` or `text/csv`) with `Content-Disposition: attachment; filename="kalan-<what>.<ext>"`
  and `X-Kalan-Skipped-Rows` (OFX holds one currency: rows in other currencies are left out and counted).
  Rows: every stored transaction (statements, manual, imports) except opening balance lines (`carry_over`).
  - `hledger`: one entry per row (`expenses:<category or kind>` or `assets:payments` against
    `liabilities:card:<bank>:<last4>`; `manual` / `import` for loose rows), tags `kind`, `source`, `id`,
    `installment`; plans as periodic transactions (`~ monthly from .. to ..`, for `hledger --forecast`).
  - `beancount`: `option "operating_currency"`, `open` directives, one entry per row with `kalan-id` / `kind` /
    `installment` metadata, plans as `custom "kalan-plan"` entries.
  - `ofx`: OFX 2.2 credit card statement in `currency` (default base currency); charges negative, `FITID` = kalan id,
    installment `k/n` in `MEMO` when the description does not carry it.
  - `csv`: `date,description,debit,credit,currency,installment,kind,category,source,account,id` (plain dot decimals);
    `what=plans` (CSV only, else 422 `plans_csv_only`) gives
    `plan_id,description,kind,source,amount_each,remaining_count,ends,total_remaining,currency`.
  CSV and OFX exports import back through `POST /imports` with the same dates, amounts, directions and installment
  numbers.
