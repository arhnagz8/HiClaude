# Builder brief B8 — `packages/live` (real adapters, fixture-tested)

Prerequisites: research specialists 02 (exchanges/APIs), 03 (gateways/bank/chain/identity/SMS/Bale), 09 (platform/Telegram/Bale) have delivered (`docs/03-research/02-*.md`, `03-*.md`, `09-*.md`, `data/exchanges.json`, `data/gateways.json`, `data/platform.json`, `data/identity_vendors.json`). Contracts: `packages/contracts/src/ports.ts` (normative).
Read first: `/home/user/HiClaude/CLAUDE.md`, the three research docs above, `architecture.md` §3, §13.
You OWN `packages/live/**`. No git commit/push. Deps: `zod`, `@hiclaude/contracts`; use global `fetch` (Node 22). No SDK dependencies unless clearly justified.

## Scope
Implement **real adapters** for the ports where an official/documented API exists, plus an explicit `Unsupported`/`ManualPanel` adapter where it does not (operator-assisted flows). **No network in tests** — every adapter is tested against recorded JSON **fixtures** (request/response pairs you author from documentation; mark each fixture's provenance and `UNVERIFIED` where inferred) through an injectable `HttpClient`.

1. `http/` — `HttpClient` interface + `FetchHttpClient` (timeouts, retries with jittered backoff for idempotent calls, rate-limit handling, error mapping to `PortError`, redaction of secrets in logs), `FakeHttpClient` for tests (route table → fixtures).
2. **Exchanges** (`exchange/`): for each exchange with a documented API (per research: e.g. Nobitex, Tabdeal; others only if documented) implement `ExchangeAccountPort` — public ticker/orderbook for USDT/IRT, balances, market buy/sell, withdraw (network/address whitelisting caveats), withdrawal status, deposit status. Map exchange-specific units (Rial vs Toman!) at the boundary; encode their error codes → `PortError`. Provide `ExchangeRateOnly` adapters (public tickers only) for the rest.
3. **Payment gateways** (`gateway/`): Zarinpal-style `create/verify` (+ Rial↔Toman conversion), plus 1–2 others if documented (IDPay/Zibal/NextPay/Vandar); sandbox flags; callback parameter parsing helpers.
4. **Bank/statement** (`bank/`): where a business-banking/open-banking API is documented (per research), implement `BankPort.listCredits/balance/transferOut`; otherwise provide `SmsStatementParser` (parse bank SMS texts of major banks into `BankCredit` with per-bank regex fixtures) and a `ManualStatementImport` (CSV upload) adapter.
5. **Chain** (`chain/`): TronGrid (TRC20 USDT incoming/outgoing, tx status), BscScan/Etherscan-v2 family (BEP20), TON API (jetton transfers/memos) — read-only monitoring + `send` only when a signer is injected (`Signer` interface; **no private keys handled in this package**; document an HSM/hot-wallet service contract); `screenAddress` against the **OFAC SDN digital-currency address list** (loader for the published list format + optional paid analytics provider adapter interface).
6. **Messengers** (`messenger/`): Telegram Bot API and Bale Bot API clients (sendMessage, inline/web-app buttons, setWebhook, answerCallbackQuery) + **initData verification**: Telegram HMAC-SHA256 (`WebAppData`) and Ed25519 `signature` variant if documented; Bale equivalent per research; replay window; tests with known vectors.
7. **SMS** (`sms/`): Kavenegar/Ghasedak/Melipayamak OTP adapters per research docs; template/verify-lookup semantics.
8. **Identity** (`identity/`): vendor adapters for Shahkar/card-owner inquiry per `data/identity_vendors.json` (only documented, lawful, consent-based APIs).
9. **Card providers** (`provider/`): `ManualPanelProvider` (capabilities all `panel` — API calls return `REJECTED` with instructions; operators work in the vendor panel) as the default for mpay-like providers; API adapters only where an official API is documented (e.g. voucher aggregators); never scrape or automate a UI against a provider's terms.
10. **Factory** (`createLivePorts(env): AppPorts`) building the right adapters from environment/config with clear errors for missing credentials; `.env` variable docs in `packages/live/README.md` (which variable, where to obtain, rotation advice).
11. **Compliance hooks**: every adapter that moves value logs an audit record via an injected `AuditSink`; no PII/secrets in logs.

## Tests and acceptance
≥ 120 fixture-based tests (success, each documented error code, timeouts/retries, rate limits, unit conversions, signature vectors). `npx tsc --noEmit -p packages/live` and `npx vitest run packages/live` green. `packages/live/README.md`: adapter matrix (port × vendor × status: tested-with-fixtures / documented-unverified / manual), env table, go-live checklist for connecting each adapter (sandbox first), and the list of facts that MUST be verified against the vendor's current docs before enabling (each marked in code with `// VERIFY:`).

## Return
Adapter matrix, files, env vars, fixtures provenance, risks/unknowns.
