# Brief 11 — ux-product-fa

**Goal:** Persian-first UX/product specification for the website, Mini Apps (Telegram + Bale) and the admin/operator panel, with complete microcopy.
**Deliverables:** `docs/03-research/11-ux-fa.md`, `docs/05-architecture/ux-spec.md`, `data/copy.fa.json` (key → Persian string, ≥200 keys), `docs/05-architecture/design-tokens.json`.

## Checklist
1. Research Iranian users' trust/UX patterns for FX/payment services (what builds trust: price transparency, Enamad, response time, order tracking, receipts) and pain points from competitor reviews.
2. **Information architecture & screens** — customer web/Mini App: home with live rate board, catalogue, product detail, **live calculator**, checkout with 3 payment methods, receipt upload, order timeline, card-reveal flow, wallet, referral, support, KYC, legal pages;
   admin/operator: queue, order detail, payment matching, fulfilment console, treasury dashboard, pricing editor, rate monitor & kill switch, reports, risk flags, audit log, RBAC. Wireframe-level ASCII per screen with **all states** (empty / loading / error / quote-expired / price-changed / payment-mismatch / provider-outage).
3. **Design system**: brand tokens (colours, typography, spacing, radii, shadows), RTL specifics, Persian numerals, Toman formatting (e.g. «۱٬۲۳۴٬۰۰۰ تومان»), Jalali dates, currency-input behaviour, accessibility, dark mode, mobile-first within Telegram viewport limits.
4. **Microcopy deck** in Persian for every state/error/notification/SMS/Telegram message (≥200 strings) + tone guide (formal-friendly).
5. **Notification matrix** (events × channels: in-app, Telegram, Bale, SMS, e-mail) with templates.
6. **Mini App specifics**: theme blending, BackButton/MainButton flows, deep links (`startapp`), referral sharing; Bale differences.
7. **Performance budget** for poor networks; offline/PWA behaviour.
8. Honest conversion tactics (price-lock countdown, clear fee breakdown, savings vs market) — no dark patterns. Customer-facing price breakdown that is truthful without exposing the supplier.
9. **Rush/Express upsell UX** and capacity messaging.

## Output notes
`data/copy.fa.json` is flat: `{ "home.hero.title": "…", "checkout.pay.c2c.title": "…" }` (no Record wrapper — it is content, not a perishable fact).
`design-tokens.json`: `{ "color": {...}, "font": {...}, "space": {...}, "radius": {...}, "shadow": {...}, "breakpoints": {...} }` with light/dark.
