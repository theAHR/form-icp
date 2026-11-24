# API contract

Base: `/api`. JSON responses use `Cache-Control: no-store`. Auth is an HttpOnly session cookie. POST requests require an exact `Origin` matching `APP_URL`. Error shape: `{ "error": "..." }`; validation may add `issues`. Statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 missing, 409 stale/duplicate/transition conflict, 429 rate limit.

| Method     | Path                          | Purpose / authorization                                        |
| ---------- | ----------------------------- | -------------------------------------------------------------- | ----------------------------- |
| GET        | me                            | Current user with roles/permissions, never password hash       |
| POST       | login                         | `{username,password}`; rate limited, audit                     |
| POST       | logout                        | Revoke current session                                         |
| POST       | password                      | `{current,password}`; revoke all sessions                      |
| GET        | public-form/:slug             | Current published schema; authentication for private forms     |
| POST       | submit                        | `{versionId,answers,personId?,requestId?,supersedesId?}`       |
| POST       | upload?form=slug              | multipart `file`; guest uploads require published public form  |
| GET        | files/:id                     | Owner or permitted submission reader                           |
| GET        | verify/:token                 | Minimal validity and expiry, no person identity                |
| GET        | dashboard                     | Aggregated counts, authorized recent audit entries             |
| GET        | forms                         | Permitted forms and latest version (drafts only for editors)   |
| POST       | forms/save                    | New immutable draft or published version                       |
| POST       | forms/archive                 | `{id}`                                                         |
| GET        | people?q=...                  | Authorized duplicate/person lookup, minimum 3 characters       |
| GET        | requests                      | q/status/sort=asc\|desc/page/size                              |
| GET        | request/:id                   | Person, permitted version-rendered answers, history            |
| POST       | requests/transition           | `{id,expected,status,reason?,expirationDate?,membershipType?}` |
| POST       | requests/note                 | `{id,internalNote,assignedTo: userId                           | null}`                        |
| GET        | members                       | q/status/sort/page/size; identity redacted for viewers         |
| POST       | members/save                  | `{id,status,expirationDate,membershipType,photoId?}`           |
| GET        | cards                         | Paginated cards, no QR token in list                           |
| GET        | card-preview/:id              | Authorized HTML with escaped values and generated QR/barcode   |
| POST       | cards/issue                   | `{memberId,templateId,printerId}`; card + print job atomic     |
| POST       | cards/revoke                  | `{id}`                                                         |
| GET / POST | templates / templates/save    | Template definitions, validated layout bounds                  |
| GET / POST | printers / printers/save      | Device metadata; no caller-controlled bridge URL               |
| GET        | print-jobs                    | Paginated queue                                                |
| POST       | print-jobs/update             | `{id,action:"retry"                                            | "cancel"}`; state constrained |
| GET / POST | users / users/save            | User lifecycle and role constraints                            |
| GET        | export?type=members\|requests | Authorized CSV, maximum 10,000 rows                            |
| GET        | audit                         | Paginated audit                                                |
| GET / POST | settings / settings/save      | `{organizationName,requireInterview}`                          |

Form save: `{id?, title, slug, purpose: APPLICATION|INTERVIEW|GENERAL, public, sensitive, schema, publish, expectedVersion: string|null}`. `expectedVersion` is the latest version ID, including drafts. On conflict, reload instead of silently overwriting.

Member status: ACTIVE/EXPIRED/SUSPENDED/CANCELLED. Request transitions are in `lib/workflow.ts`. Card cancellation is REVOKED; verification also checks membership status and both expiration dates.

## Print bridge

`POST {PRINT_SERVICE_URL}/jobs`, `Authorization: Bearer {PRINT_SERVICE_TOKEN}`. Payload `{id,printer,html}`. `id` is `printJobId-attemptNumber` and MUST be durably persisted before any physical side effect. The same ID MUST return its existing state without re-spooling.

Response `{id,status}` with ACCEPTED/PROCESSING/AWAITING_CONFIRMATION/PRINTED/FAILED/UNKNOWN. Only PRINTED acknowledges physically confirmed printing. Timeout/connection failure does not justify a new idempotency key. The included Windows agent does not log card HTML or bearer tokens.
