#!/usr/bin/env python3
"""Brief 10: builds data/ops_growth.json and prints unit-economics tables. Run: python3 scripts/research/10_ops_growth.py [--write]
All growth numbers are model assumptions (UNVERIFIED, low) unless a source is given."""
import json, sys, os
AS="2026-10-02"
MW=[{"url":"https://www.asriran.com/fa/news/1149922/","title":"1405 wage decree","note":"per search summary"},{"url":"https://www.taadolnewspaper.ir/fa/news/383834/","title":"wage circular 1405","note":"per search summary"}]
def R(v,unit,how,conf="low",st="UNVERIFIED",src=None,note=None):
    r={"value":v,"unit":unit,"as_of":AS,"confidence":conf,"status":st,"verify_how":how}
    if src: r["sources"]=src
    if note: r["note"]=note
    return r
A="Model assumption; replace with measured first-90-day data from our own analytics (UTM + cohort tables)."
# channels: cac_irt per first-order customer, visit->signup, signup->first order, saturation (monthly spend at half-saturation)
ch={}
def chan(id,cac,cpv,v2s,s2o,sat,lag,note):
    ch[id]={"cac_irt":R(cac,"IRT per first-order customer",A),"cost_per_visit_irt":R(cpv,"IRT",A),
     "visit_to_signup":R(v2s,"ratio",A),"signup_to_first_order":R(s2o,"ratio",A),
     "half_saturation_irt_per_month":R(sat,"IRT",A),"lag_days":R(lag,"days",A),"note":note}
chan("seo",250000,0,0.10,0.25,60000000,120,"Cheap per customer but slow; content+Persian landing pages; cost is writer/dev time")
chan("telegram_channels",380000,9000,0.10,0.25,40000000,5,"Ads via Telegram Ads is restricted for Iran; assume paid posts in channels (admin-to-admin); verify availability")
chan("instagram",450000,12000,0.08,0.20,30000000,14,"Instagram is filtered in Iran; reach via VPN users; creative-heavy")
chan("bale_eitaa",300000,6000,0.10,0.22,20000000,7,"Domestic messengers; smaller audience, cheaper")
chan("influencers",600000,0,0.06,0.20,25000000,10,"Seller/creator partnerships; lumpy; disclose sponsorship")
chan("price_comparison",500000,15000,0.07,0.30,30000000,3,"Torob/Emalls style CPC; high intent; fee schedule UNVERIFIED")
chan("b2b",1500000,0,0.30,0.35,10000000,45,"Agencies/dev shops; outbound; few accounts, high AOV")
chan("referral",200000,0,0.25,0.40,0,14,"Reward paid only after referee's first completed order; self-referral blocked")
seg={}
def S(id,fa,share,aov,opy,ps,ch_,basket):
    seg[id]={"label_fa":fa,"share":R(share,"ratio of customers",A),"aov_usd":R(aov,"USD",A),"orders_per_year":R(opy,"count",A),
      "price_sensitivity":R(ps,"0-1 (1 = switches for 1% cheaper)",A),"preferred_channel":R(ch_,"channel id",A),"basket":basket}
S("student","دانشجو",0.14,25,4,0.9,"telegram","subscriptions, small top-ups, exam fees")
S("freelance_dev","فریلنسر برنامه‌نویس",0.14,45,10,0.5,"web","cloud/API credits, domains, SaaS, card top-up")
S("designer","طراح",0.08,35,6,0.55,"web","design tool subscriptions, stock, fonts")
S("gamer","گیمر",0.12,22,9,0.8,"telegram","Steam/PSN gift cards, in-game top-ups")
S("ads_manager","مدیر تبلیغات کسب‌وکار کوچک",0.07,250,14,0.4,"web","ad-platform top-ups, card loads")
S("importer","واردکننده/بازرگان کوچک",0.03,800,6,0.35,"web","supplier payments (higher-risk; heavier KYC)")
S("exam_applicant","داوطلب آزمون/مهاجرت",0.12,230,1.5,0.3,"web","IELTS/TOEFL/GRE/embassy fees")
S("traveller","مسافر",0.10,120,2,0.5,"telegram","travel card, booking, eSIM")
S("parent_tuition","والدین (شهریه)",0.04,3500,1.2,0.25,"web","tuition/fees: large, trust-driven, high scrutiny")
S("casual_subscriber","مشترک عادی (استریم/AI)",0.16,18,9,0.7,"telegram","ChatGPT/Spotify/Netflix subscriptions")
ret={"month_k_active_share":R([1.0,0.38,0.27,0.22,0.19,0.17,0.155,0.145,0.135,0.128,0.12,0.115,0.11],"share of cohort ordering in month k (k=0..12)",A,note="monthly active curve; blended")}
ref={"referral_coefficient_k":R(0.12,"new customers per existing customer per year",A),"payout_irt_per_referral":R(150000,"IRT after referee first completed order",A),
 "referee_discount_irt":R(100000,"IRT",A),"max_payout_per_referrer_per_month":R(2000000,"IRT",A,note="cap + single-person ban = anti-farming (guardrail)")}
staff={t:R(v,"tasks per operator-hour",A) for t,v in {"issue_card":6,"topup_card":12,"deliver_voucher":30,"pay_service":8,"custom":5,"payment_review_manual":20,"support_ticket":6}.items()}
staff["target_utilisation"]=R(0.7,"ratio",A)
sal={"minimum_wage_base_monthly_1405":R(16600000,"IRT per month",
  "Check Ministry of Labor 1405 circular; summary also lists housing 3,000,000 and seniority 500,000 IRT/month",conf="medium",st="reported",src=MW),
 "operator_gross":R(22000000,"IRT per month",A),"support_gross":R(20000000,"IRT per month",A),
 "admin_ops_lead_gross":R(35000000,"IRT per month",A),"junior_dev_gross":R(55000000,"IRT per month",A),"senior_dev_gross":R(95000000,"IRT per month",A),
 "employer_cost_multiplier":R(1.25,"x gross",
  "04-legal-tax: employer insurance 20%+3% unemployment (low); confirm with accountant",conf="low"),
 "night_premium":R(0.2,"ratio",A),"annual_indexation":R(0.35,"per year (inflation-linked)",A,note="owner policy; sim lags inflation 6 months")}
opex={"coworking_seat":R(4500000,"IRT per seat per month",A),"tools_saas_total":R(8000000,"IRT per month",A),
 "hosting_iran_vps_and_cdn":R(6000000,"IRT per month",A),"accounting_service":R(15000000,"IRT per month",A),
 "sms_otp_and_notifications":R(3,"IRT-thousand per order (3000 IRT)",A),"enamad_fee":R(175000,"IRT per 2 years",
  "see 04-legal-tax F28",src=[{"url":"docs/03-research/04-legal-tax-ir.md","title":"F28"}]),
 "bank_gateway_fee_note":R(None,"see data/gateways.json",A)}
rates={"operator_error_rate":R(0.02,"ratio of tasks",A),"refund_rate":R(0.025,"ratio of orders",A),"fraud_loss_rate":R(0.003,"ratio of GMV",A),
 "chargeback_equiv_dispute_rate":R(0.004,"ratio of orders",A),"late_payment_rate_c2c":R(0.06,"ratio",A),"wrong_network_rate_usdt":R(0.012,"ratio",A)}
sla={"first_response_minutes_business":R(10,"minutes p90",A),"first_response_minutes_night":R(45,"minutes p90",A),
 "fulfil_minutes_instant_voucher":R(5,"minutes p90",A),"fulfil_minutes_topup":R(30,"minutes p90",A),"fulfil_minutes_new_card":R(120,"minutes p90",A),
 "fulfil_minutes_custom":R(480,"minutes p90",A),"fulfil_minutes_rush":R(15,"minutes p90",A),"refund_decision_hours":R(24,"hours",A),
 "nps_target":R(45,"points",A),"float_utilisation_target":R(0.6,"ratio",A),"take_rate_target":R(0.06,"ratio of GMV",A)}
rep={"failure_conversion_hit":R(-0.25,"relative change in visit->order conversion in the 14 days after a publicised failure",A),
 "negative_review_wave_hit":R(-0.15,"relative, decays",A),"recovery_half_life_days":R(45,"days",A),
 "trust_gain_per_good_order":R(0.0004,"trust points",A),"enamad_conversion_lift":R(0.08,"relative",A),"visible_sla_guarantee_lift":R(0.05,"relative",A)}
seas={"monthly_multiplier_jalali":R([1.15,0.95,0.9,1.0,1.0,1.0,1.1,1.05,1.0,1.05,1.0,1.1],"x (Farvardin..Esfand)",A,note="Nowruz/ Mehr back-to-school; Fall exam season; pure prior")}
comp={"price_war_defence_order":["match only on top-5 SKUs","bundle/loyalty not blanket discount","raise rush premium capacity","never go below floor margin (owner_policies floorMarginPct)"],
 "loyalty_tiers":{"bronze":{"annual_spend_usd":0,"fee_discount_pct":0},"silver":{"annual_spend_usd":300,"fee_discount_pct":0.3},"gold":{"annual_spend_usd":1500,"fee_discount_pct":0.6}}}
launch={}
for name,cap in (("50M",50e6),("300M",300e6),("1B",1e9)):
    launch[name]={"starting_capital_irt":cap,"marketing_90d_irt":R(round(cap*0.12),"IRT",A),"staff_90d_irt":R(round(cap*0.10),"IRT",A),
     "float_reserve_irt":R(round(cap*0.65),"IRT",A),"legal_setup_irt":R(round(cap*0.05),"IRT",A,note="company registration cost UNVERIFIED"),"contingency_irt":R(round(cap*0.08),"IRT",A)}
doc={"_meta":{"file":"data/ops_growth.json","owner_agent":"10-ops-growth","as_of":AS,
 "note":"Search budget exhausted; only 2 searches (1405 minimum wage supported; Torob CPC schedule NOT found). Everything else is a labelled assumption for the simulator; calibrate in first 90 days. Not legal/tax advice."},
 "channels":ch,"segments":seg,"retention":ret,"referral":ref,"staffing":staff,"salaries":sal,"opex":opex,"rates":rates,"sla":sla,"reputation":rep,"seasonality":seas,"competitor_response":comp,"launch_budgets":launch}
# unit economics
if True:
    take=0.06
    print("segment, annual GMV USD, annual gross profit USD at 6% take")
    tot=0
    for k,v in seg.items():
        g=v["aov_usd"]["value"]*v["orders_per_year"]["value"]; tot+=g*v["share"]["value"]
        print(k,g,round(g*take,1))
    curve=ret["month_k_active_share"]["value"]; blend_aov=sum(v["aov_usd"]["value"]*v["share"]["value"] for v in seg.values())
    life_orders_12m=sum(curve)*0.7
    print("blended AOV",round(blend_aov,1),"expected orders in 12m per acquired customer ~",round(life_orders_12m,2))
    print("12m gross profit per customer USD",round(life_orders_12m*blend_aov*take,1),"IRT @258k:",round(life_orders_12m*blend_aov*take*258465))
if "--write" in sys.argv:
    p=os.path.join(os.path.dirname(__file__),"..","..","data","ops_growth.json")
    json.dump(doc,open(p,"w"),ensure_ascii=False,indent=1); print("written",p)
