# Brief 09 — platform-tech-security

**Goal:** Verified technical facts to build and operate the stack in Iran's network reality, including Telegram/Bale Mini Apps and secure handling of virtual-card data.
**Deliverables:** `docs/03-research/09-platform-tech-security.md`, `data/platform.json`.

## Checklist
1. **Telegram Bot API + Mini Apps**: initData validation (HMAC variant and Ed25519 `signature` variant), WebApp JS API (MainButton, BackButton, themeParams, viewport, CloudStorage, haptics, openInvoice/Stars), BotFather setup steps,
   webhook vs long-polling, rate limits, file/receipt upload handling, HTTPS/domain requirements, **payments rules** (Stars for digital goods since 2024-06-12; third-party providers only for physical goods) and how a Toman-priced digital service can lawfully operate
   (pay on the web, bot shows status), ban risks for financial bots, Telegram accessibility in Iran (filtering, VPN dependence).
2. **Bale**: bot API base URL & methods, mini-apps/WebApp SDK and initData validation, payments (wallet/`sendInvoice`), differences vs Telegram, bot creation, publication requirements, limits; Eitaa/Rubika/Soroush-Plus briefly.
3. **Iran hosting & network**: Iranian clouds/VPS (ArvanCloud, Hamravesh, ParsPack, Iranserver, Mizbanfa…) pricing/features/DDoS/CDN, TLS issuance reachability, DNS, reachability of foreign hosts from Iran, latency, data-residency expectations,
   outbound access from Iran-hosted servers to chain/exchange APIs (often blocked) → **lawful architecture patterns** (split deployment: edge in Iran, workers elsewhere; egress relay), uptime monitoring.
4. **PWA / slow-network** practices: self-hosted fonts (Vazirmatn), no Google CDN dependence, image optimisation, RTL pitfalls, Persian numerals/Jalali libraries (Intl `fa-IR-u-ca-persian`, `jalaali-js`, `date-fns-jalali`), accessibility.
5. **Security**: threat model for a financial reseller (account takeover, SIM swap, bot abuse, receipt forgery, card-detail leakage, insider); secrets management; **encryption at rest for card PAN/CVV** (envelope encryption), PCI-DSS scope reasoning for
   *displaying/storing third-party-issued virtual-card details*, reveal-once + TTL + step-up auth; admin 2FA (TOTP), RBAC, audit logs, rate limiting, WAF, CSRF/XSS/CSP, dependency hygiene, backups/DR (SQLite → Postgres path), PII-free logging.
6. **Observability & ops**: health checks, alerts, runbooks, log retention.
7. **Library versions** known-good in 2026 (Fastify, zod, React, Vite, Tailwind, grammY, `@twa-dev/sdk`, TanStack Query, i18n, `jalaali-js`, decimal.js, vitest, Playwright) and breaking changes to avoid. Verify `node:sqlite` stability on Node 22.
8. **Infra cost** per month (Toman and USD) for MVP / growth / scale.

## JSON
`data/platform.json`: Records for endpoints, limits (Telegram rate limits, Bale limits), pinned versions, infra prices, validation algorithm notes.
