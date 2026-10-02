# HTTP API spec v1 (`apps/api`, Fastify) **[CONTRACT]**

Base path `/api/v1`. JSON in/out. UTF-8. Money fields are integers (Toman `…Irt`, `…MicroUsdt`, `…UsdCents`). Timestamps are epoch ms (UTC). Errors: `{ "error": { "code": "ORDER_INVALID_TRANSITION", "messageFa": "...", "details": {} } }` with proper HTTP status (400/401/403/404/409/422/429/503).
Types/schemas live in `packages/contracts/src/api.ts` (zod) — both server and web import them. Additive changes only.

## Auth
- Customer session: httpOnly cookie `sid` (also `Authorization: Bearer` for Mini Apps). Created by OTP verify or messenger initData verify.
- Staff session: cookie `ssid`; roles `owner|admin|operator|support|accountant|viewer`; every mutating admin call writes `audit_log`.
- Demo mode (`DEMO=1`): fixed OTP `12345`, seeded staff accounts (`owner/owner`, `operator/operator`, …) clearly labelled; `/sim/*` enabled.

## Customer endpoints
| Method & path | Purpose |
|---|---|
| `GET /public/config` | brand, now, payment methods (enabled + display fees), rush tiers (availability/ETA), rate board (our indicative USD sell rate in Toman, updated ts), legal links, support channels, kill-switch banner |
| `GET /catalog` | products with live "from" prices, risk label, restriction note, SLA |
| `GET /catalog/:id` | product detail incl. amount options, required inputs, fulfilment mode notes |
| `POST /quotes` | `{productId, amountUsdCents?, rushTier, inputs?}` → `QuoteDto` with itemised lines + totals per payment method + `lockedUntil` |
| `POST /orders` | `{quoteId, method, inputs}` → `OrderDto` with payment instructions (gateway URL | c2c destination card + unique amount | USDT address/network/amount/memo | wallet) |
| `GET /orders`, `GET /orders/:id` | list/detail incl. timeline (`OrderEventDto[]`), SLA ETA |
| `GET /orders/:id/stream` | SSE: `order.updated`, `payment.updated`, `delivery.ready` |
| `POST /orders/:id/receipt` | c2c receipt `{trackingNo, payerCardLast4, paidAt, imageDataUrl?}` |
| `POST /orders/:id/cancel`, `/confirm`, `/dispute` | lifecycle actions |
| `POST /orders/:id/reveal` | one-time reveal of card details/voucher code (needs fresh OTP step-up token) |
| `GET /gateway/callback/:gatewayId` | PSP redirect; verifies and redirects to `/orders/:id` |
| `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/messenger`, `/auth/logout` | sessions |
| `GET /me`, `PATCH /me`, `POST /me/kyc` | profile, tier, limits, KYC submission (national id, name) |
| `GET /wallet`, `POST /wallet/topup` | Toman wallet |
| `GET /referral` | code, stats |
| `POST /tickets`, `GET /tickets`, `POST /tickets/:id/messages` | support |
| `POST /hooks/telegram`, `POST /hooks/bale` | bot webhooks (secret token verified) |

## Admin endpoints (`/admin/*`)
`GET /dashboard` · `GET /orders?status&q&from&to&page` · `GET /orders/:id` · `POST /orders/:id/{approve-payment|reject-payment|cancel|refund|retry|hold|release}` ·
`GET /tasks?status` · `POST /tasks/:id/{claim|complete|fail|release}` (complete body includes delivery payload) ·
`GET /payments/unmatched` · `POST /payments/:id/match` ·
`GET /treasury` (balances, lots, coverage, plan) · `POST /treasury/actions/{buy|withdraw|sweep}` · `GET /treasury/lots` ·
`GET /rates` · `GET /rates/history?hours` · `POST /rates/kill-switch` ·
`GET|PUT /policy/pricing` · `GET|PUT /settings` · `GET|PUT /catalog/products/:id` ·
`GET /customers` · `GET /customers/:id` · `POST /customers/:id/{block|unblock|limit|tier}` ·
`GET /tickets` · `POST /tickets/:id/{assign|reply|close}` ·
`GET /reports/statements?from&to&basis=nominal|real|usd` · `GET /reports/kpis?from&to` · `GET /ledger/entries?account&from&to` ·
`GET /audit` · `GET|POST /users` ·
**Demo only:** `GET /sim/state` · `POST /sim/advance {minutes}` · `POST /sim/speed {x}` · `GET /sim/scenarios` · `POST /sim/scenario {id}` · `POST /sim/event {type, params}` · `GET /sim/world` (macro path, competitors, staff).

## Realtime
SSE endpoints: `/orders/:id/stream` (customer) and `/admin/stream` (queue changes, alerts, rate ticks). Heartbeat every 15 s. Clients must reconnect with backoff.

## Idempotency & concurrency
`Idempotency-Key` header on `POST /orders`, `/orders/:id/receipt`, admin money actions. Optimistic version column on orders/tasks (`409 CONFLICT` on stale write).

## Rate limits (defaults)
OTP request: 3/10 min per phone; OTP verify: 5/hour; quotes: 60/min/session; orders: 10/hour/new customer; reveal: 3/day/order.

## Observability
`GET /health` (liveness), `GET /ready` (db, rates freshness, jobs lag), request ids, structured logs without PII.
