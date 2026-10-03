#!/usr/bin/env python3
"""Builds data/copy.fa.json (flat key -> Persian string) and lints it.  Run: python3 scripts/research/11_build_copy.py [--check]
Sources: (1) snapshot of apps/web/src/copy/fa.ts (shared namespaces auth/common/host/nav/risk/status/system, kept IDENTICAL so the web app can import),
         (2) scripts/research/11_copy/part*.py (new namespaces).
Lints: placeholder whitelist, ASCII digits, Arabic letter forms, ZWNJ, punctuation, banned wording (customer namespaces), SMS segments,
       notification matrix <-> template keys <-> variables.   Exit 1 on any ERROR."""
import json, re, sys, importlib.util, pathlib, math
ROOT = pathlib.Path(__file__).resolve().parents[2]
PARTS = sorted((ROOT / 'scripts/research/11_copy').glob('part*.py'))
OUT = ROOT / 'data/copy.fa.json'
errors, warns = [], []
E = lambda m: errors.append(m)
W = lambda m: warns.append(m)

# ---------- load shared snapshot from the web app (read-only) ----------
def flatten(n, p=''):
    for k, v in n.items():
        if isinstance(v, dict): yield from flatten(v, p + k + '.')
        else: yield p + k, v
base = {}
fa_ts = ROOT / 'apps/web/src/copy/fa.ts'
if fa_ts.exists():
    s = fa_ts.read_text()
    obj = json.loads(s[s.index('= {') + 2: s.rindex('}') + 1])
    base = {k: v for k, v in flatten(obj) if isinstance(v, str)}
    lists = [k for k, v in flatten(obj) if not isinstance(v, str)]
    if lists: W(f'web copy has non-string leaves (skipped): {lists[:5]}')
else:
    W('apps/web/src/copy/fa.ts not found; shared namespaces omitted')

copy = dict(base)
for p in PARTS:
    spec = importlib.util.spec_from_file_location(p.stem, p); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    for k, v in m.COPY.items():
        if k in copy: E(f'duplicate key {k} ({p.name})')
        copy[k] = v

# ---------- lint ----------
ALLOWED_VARS = set('''brand domain code time minutes hours amount balance rate pct n id name product tier method reason url diff old new left total done
current network host phone page legalName regNo version date value limit perOrder perDay level terms refund privacy q source status outcome target
customer flag score provider days min max scope word keys role qty account action step min max free title hint feature field label
tierLabel email subject text size count max'''.split())
CUSTOMER_PREFIX_EXEMPT = ('admin.', 'sim.', 'notif.admin.')
PLACE = re.compile(r'\{(\w+)\}')
ASCII_DIGIT = re.compile(r'\d')
LATIN_TOKEN = re.compile(r'[A-Za-z]+\d*[A-Za-z]*')
BANNED = [r'مجوز', r'کاملاً قانونی', r'قانونی و مجاز', r'بانک مرکزی', r'بدون ریسک', r'صرافی', r'خرید دلار', r'فروش دلار', r'تضمین(?! نمی)', r'ضمانت']
ARABIC = re.compile('[يكى]')           # arabic yeh/kaf/alef maksura
SPACE_MI = re.compile(r'(?<![‌\w])(نمی|می|بی) (?=[؀-ۿ])')   # "می شود" -> "می‌شود"
SPACE_HA = re.compile(r' ها\b')
ASCII_PUNCT = re.compile(r'[?]|,(?!\d)')
ALLOWED_MI = {'می بینید'}   # none by default

for k, v in copy.items():
    if not isinstance(v, str) or not v.strip(): E(f'{k}: empty or non-string'); continue
    if not re.fullmatch(r'[A-Za-z0-9_]+(\.[A-Za-z0-9_\-]+)+', k): E(f'{k}: key must be dotted ascii')
    stripped = PLACE.sub('', v)
    for var in PLACE.findall(v):
        if var not in ALLOWED_VARS: E(f'{k}: placeholder {{{var}}} not in whitelist')
    # ASCII digits only inside latin tokens (TRC20, jpg, ...) or sms OTP '#'
    for tok in LATIN_TOKEN.sub('', stripped).split('\n'):
        if ASCII_DIGIT.search(tok): E(f'{k}: ASCII digit in Persian text -> use Persian digits: {tok!r}')
    if ARABIC.search(v): E(f'{k}: Arabic yeh/kaf — use Persian ی/ک')
    if SPACE_MI.search(stripped): E(f'{k}: missing ZWNJ after می/نمی/بی: {SPACE_MI.search(stripped).group(0)!r}')
    if SPACE_HA.search(stripped): W(f'{k}: " ها" should be attached with ZWNJ')
    if ASCII_PUNCT.search(stripped) and 'http' not in v: E(f'{k}: ASCII ? or , in Persian text (use ؟ ،)')
    if '  ' in v: E(f'{k}: double space')
    if v != v.strip(): E(f'{k}: leading/trailing space')
    if not k.startswith(CUSTOMER_PREFIX_EXEMPT):
        for pat in BANNED:
            if re.search(pat, v): E(f'{k}: banned wording /{pat}/ (customer-facing guard list, legal D9)')
    if k.endswith(('.cta', '.title')) and len(PLACE.sub('xxxxx', v)) > 48: W(f'{k}: long ({len(v)} chars) for a title/CTA')
    if k.startswith('host.mainButton') and len(v) > 24: W(f'{k}: MainButton text > 24 chars')
    if '<' in v or '>' in v: E(f'{k}: raw HTML not allowed in copy')

# ---------- SMS segments ----------
SAMPLE = {'code': '12345', 'brand': 'کارتینو', 'time': '۲ دقیقه', 'domain': 'kartino.ir', 'url': 'kt.ir/o/ab12', 'amount': '۳۲٬۱۰۳٬۰۰۰ تومان', 'id': 'T-104'}
def seg(v):
    t = PLACE.sub(lambda m: SAMPLE.get(m.group(1), 'xxxxxx'), v)
    n = len(t)
    return n, 1 if n <= 70 else math.ceil(n / 67)
sms_rows = []
for k, v in copy.items():
    if k.endswith('.sms'):
        n, s = seg(v); sms_rows.append((k, n, s))
        lim = 1 if k == 'notif.auth.otp.sms' else 2
        if s > lim: E(f'{k}: {n} chars = {s} SMS segments (limit {lim})')

# ---------- notification matrix ----------
# cell codes: A always (if channel linked) / F fallback only (no messenger linked or messenger send failed) / O user opt-in / - none
M = {  # id: (inapp, msg, sms, email, vars, trigger)
 'auth.otp': ('-', 'F', 'A', '-', 'code time brand domain', 'auth.otp.request, step-up (reveal/KYC)'),
 'account.welcome': ('A', 'A', '-', '-', 'brand', 'customer.registered'),
 'security.newLogin': ('A', 'A', 'F', '-', 'brand time', 'session created on new device'),
 'security.reveal': ('A', 'A', '-', '-', 'code time', 'reveal succeeded'),
 'order.created': ('A', 'A', '-', '-', 'code product amount time url', 'order.created'),
 'order.payReminder': ('A', 'A', '-', '-', 'code time url', 'timer: payExpiresAt minus 10 min'),
 'order.expired': ('A', 'A', '-', '-', 'code url', 'order.status_changed -> expired'),
 'payment.receiptReceived': ('A', 'A', '-', '-', 'code time', 'payment.receipt_submitted'),
 'payment.confirmed': ('A', 'A', 'F', '-', 'code time url brand', 'payment.confirmed'),
 'payment.rejected': ('A', 'A', 'A', '-', 'code reason url brand', 'payment.rejected'),
 'payment.under': ('A', 'A', '-', '-', 'code amount time url', 'underpayment detected'),
 'payment.over': ('A', 'A', '-', '-', 'code amount', 'overpayment credited to wallet'),
 'payment.late': ('A', 'A', '-', '-', 'code url', 'payment after payExpiresAt'),
 'payment.mismatch': ('A', 'A', '-', '-', 'code amount', 'gateway verify mismatch'),
 'payment.thirdParty': ('A', 'A', '-', '-', 'code url', 'payer instrument != KYC identity'),
 'order.riskHold': ('A', 'A', '-', '-', 'code time', 'order.status_changed -> risk_hold'),
 'order.started': ('A', '-', '-', '-', 'code', 'order.status_changed -> fulfilling'),
 'order.delayed': ('A', 'A', 'A', '-', 'code url brand', 'SLA due passed (rush premium refunded)'),
 'order.delivered': ('A', 'A', 'A', 'O', 'code url brand', 'fulfilment.completed'),
 'order.completed': ('A', 'A', '-', '-', 'code url', 'customer.confirmed / auto_complete'),
 'order.failed': ('A', 'A', 'A', '-', 'code url brand', 'fulfilment.failed (permanent)'),
 'order.refundPending': ('A', 'A', '-', '-', 'code amount time target', 'order.status_changed -> refund_pending'),
 'order.refunded': ('A', 'A', 'A', '-', 'code amount target brand', 'refund.paid'),
 'rush.refunded': ('A', 'A', '-', '-', 'code amount target', 'SLA missed on rush tier'),
 'dispute.opened': ('A', 'A', '-', '-', 'code time', 'customer.dispute'),
 'dispute.resolved': ('A', 'A', '-', '-', 'code outcome url', 'dispute.resolved_*'),
 'wallet.topup': ('A', 'A', '-', '-', 'amount balance', 'wallet credited'),
 'referral.reward': ('A', 'A', '-', '-', 'amount', 'invitee first order completed'),
 'kyc.verified': ('A', 'A', 'A', '-', 'brand', 'kyc tier raised'),
 'kyc.rejected': ('A', 'A', '-', '-', 'reason url', 'kyc rejected'),
 'ticket.reply': ('A', 'A', '-', 'O', 'id url brand', 'staff reply on ticket'),
 'product.backInStock': ('A', 'O', '-', '-', 'product url', 'product re-enabled (notify-me list)'),
 'system.salesPaused': ('A', '-', '-', '-', '', 'killswitch.changed on'),
 'system.salesResumed': ('A', '-', '-', '-', '', 'killswitch.changed off'),
 'legal.termsUpdated': ('A', '-', '-', 'A', 'version url brand', 'new legal version published'),
 'admin.paymentReview': ('A', 'A', '-', '-', 'code amount method url', 'payment.detected / receipt needs staff'),
 'admin.slaWarn': ('A', 'A', '-', '-', 'code tier time url', 'fulfilment.sla at slaWarnFraction'),
 'admin.slaBreach': ('A', '-', '-', '-', 'code', 'SLA breached'),
 'admin.killSwitch': ('A', 'A', '-', '-', 'reason scope url', 'killswitch.changed'),
 'admin.providerFail': ('A', 'A', '-', '-', 'provider pct url', 'risk.scan provider failure rate'),
 'admin.lowFloat': ('A', 'A', '-', '-', 'provider days min url', 'treasury coverage < minCoverageDays'),
 'admin.rateAnomaly': ('A', '-', '-', '-', 'pct', 'rates anomaly'),
 'admin.riskFlag': ('A', '-', '-', '-', 'customer flag score', 'risk.flagged'),
 'admin.largeOrder': ('A', '-', '-', '-', 'code amount', 'order above approval threshold'),
 'admin.unmatchedPayment': ('A', '-', '-', '-', 'amount time', 'bank credit unmatched after window'),
}
EXTRA_VARS = {'brand'}
def tmpl_keys(ev, cells):
    inapp, msg, sms, email = cells[:4]
    ks = []
    if inapp != '-': ks += [f'notif.{ev}.inapp.title', f'notif.{ev}.inapp.body']
    if msg != '-': ks += [f'notif.{ev}.msg']
    if sms != '-': ks += [f'notif.{ev}.sms']
    if email != '-': ks += [f'notif.{ev}.email.subject', f'notif.{ev}.email.body']
    return ks
expected = set()
for ev, cells in M.items():
    declared = set(cells[4].split()) | EXTRA_VARS
    for k in tmpl_keys(ev, cells):
        expected.add(k)
        if k not in copy: E(f'matrix: missing template {k}')
        else:
            for var in PLACE.findall(copy[k]):
                if var not in declared: E(f'{k}: uses {{{var}}} not declared for event {ev} (declared: {sorted(declared)})')
actual = {k for k in copy if k.startswith('notif.') and not k.startswith('notif.btn.')}
for k in sorted(actual - expected): E(f'template {k} has no matrix cell')
# secrets never in notifications
for k in actual:
    if re.search(r'CVV|رمز دوم|شماره‌ی کارت|پسورد|گذرواژه', copy[k]) and not k.startswith('notif.security'): E(f'{k}: mentions secret material')

# ---------- required keys referenced by contracts ----------
REQ = ['status.order.' + s for s in 'awaiting_payment payment_review paid risk_hold queued fulfilling delivered completed expired cancelled failed refund_pending refunded disputed'.split()]
REQ += [f'error.{c}' for c in 'VALIDATION UNAUTHENTICATED FORBIDDEN NOT_FOUND CONFLICT RATES_UNAVAILABLE KILL_SWITCH QUOTE_EXPIRED PRODUCT_UNAVAILABLE LIMIT_EXCEEDED ORDER_INVALID_TRANSITION PAYMENT_MISMATCH PAYMENT_METHOD_UNAVAILABLE RATE_LIMITED PROVIDER_ERROR INSUFFICIENT_FUNDS RUSH_UNAVAILABLE INTERNAL'.split()]
REQ += [f'calc.line.{c}' for c in 'service_value provider_fees exchange_cost volatility_buffer risk_buffer payment_fee margin rush vat rounding discount'.split()]
REQ += [f'calc.method.{c}' for c in 'gateway card_to_card bank_transfer usdt wallet'.split()]
REQ += [f'checkout.method.{c}.title' for c in 'gateway card_to_card bank_transfer usdt wallet'.split()]
REQ += [f'admin.role.{c}' for c in 'owner admin operator support accountant viewer'.split()]
REQ += [f'admin.task.kind.{c}' for c in 'issue_card topup_card deliver_voucher pay_service custom'.split()]
REQ += [f'admin.task.status.{c}' for c in 'queued claimed in_progress done failed cancelled'.split()]
for k in REQ:
    if k not in copy: E(f'required key missing: {k}')
if len(copy) < 200: E(f'only {len(copy)} keys (< 200)')

# ---------- output ----------
for w in warns: print('WARN ', w)
for e in errors: print('ERROR', e)
print(f'keys={len(copy)}  base(web snapshot)={len(base)}  new={len(copy)-len(base)}  notif templates={len(actual)}  sms={len(sms_rows)} (max segments {max((s for _,_,s in sms_rows), default=0)})  warnings={len(warns)}  errors={len(errors)}')
if '--matrix' in sys.argv:
    print('\n| event | in-app | Telegram/Bale | SMS | e-mail | variables | trigger |\n|---|---|---|---|---|---|---|')
    for ev, c in M.items():
        print(f'| `{ev}` | {c[0]} | {c[1]} | {c[2]} | {c[3]} | {c[4] or "-"} | {c[5]} |')
if errors: sys.exit(1)
if '--check' not in sys.argv:
    OUT.write_text(json.dumps(dict(sorted(copy.items(), key=lambda kv: kv[0])), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('wrote', OUT.relative_to(ROOT))
