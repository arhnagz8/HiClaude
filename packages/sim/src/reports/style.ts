/** Self-contained CSS + the tiny hover script for report.html (no external requests). Palette = validated reference slots (dataviz). */

const LIGHT = `
  --bg:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7; --border:rgba(11,11,11,.10);
  --good:#006300; --bad:#d03b3b; --warn:#fab219; --chip:#efeee9;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948;`
const DARK = `
  --bg:#0d0d0d; --surface:#1a1a19; --ink:#ffffff; --ink2:#c3c2b7; --muted:#898781; --grid:#2c2c2a; --axis:#383835; --border:rgba(255,255,255,.10);
  --good:#0ca30c; --bad:#e66767; --warn:#fab219; --chip:#262624;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;`

export const REPORT_CSS = `
:root{color-scheme:light;${LIGHT}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){color-scheme:dark;${DARK}}}
:root[data-theme="dark"]{color-scheme:dark;${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Vazirmatn,"Noto Naskh Arabic","Noto Sans Arabic",Tahoma,"Segoe UI",system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.65}
.wrap{max-width:1120px;margin:0 auto;padding:20px 16px 60px}
header.top{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
h1{font-size:24px;margin:0 0 4px;font-weight:700}
h2{font-size:18px;margin:34px 0 10px;font-weight:700;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h3{font-size:14px;margin:0 0 4px;font-weight:600}
.en{color:var(--muted);font-weight:400;font-size:.78em;direction:ltr;unicode-bidi:isolate}
.meta{color:var(--ink2);font-size:12.5px}
.meta b{color:var(--ink);font-weight:600}
.chip{display:inline-block;background:var(--chip);border:1px solid var(--border);border-radius:999px;padding:1px 10px;font-size:12px;margin-inline-end:6px;color:var(--ink2)}
button.theme{background:var(--surface);color:var(--ink2);border:1px solid var(--border);border-radius:8px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px;min-width:0}
.card .k{color:var(--ink2);font-size:12.5px}
.card .v{font-size:24px;font-weight:700;line-height:1.25;margin:2px 0}
.card .v small{font-size:12px;font-weight:500;color:var(--muted);margin-inline-start:4px}
.card .d{font-size:12px;color:var(--ink2);min-height:18px}
.card.hero .v{font-size:34px}
.pos{color:var(--good)} .neg{color:var(--bad)}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 14px 8px;margin:10px 0}
.panel h3 small{color:var(--muted);font-weight:400;margin-inline-start:8px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:10px}
.note{color:var(--ink2);font-size:12.5px;margin:2px 0 8px}
svg.chart{display:block;max-width:100%;height:auto;overflow:visible}
svg .grid{stroke:var(--grid);stroke-width:1}
svg .grid.base{stroke:var(--axis)}
svg .href{stroke:var(--axis);stroke-width:1}
svg .ax{fill:var(--muted);font-size:10.5px}
svg .ax.lab{fill:var(--ink2);font-size:11px}
svg .ax.unit{fill:var(--ink2);font-size:10.5px}
svg .end{fill:var(--ink2);font-size:11px;font-weight:600}
svg .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
svg .dot{stroke:var(--surface);stroke-width:2}
svg .area{opacity:.10}
svg .band{opacity:.12}
svg .bar{shape-rendering:geometricPrecision}
svg .noise{fill:var(--muted);opacity:.14}
svg .mk{stroke:var(--axis);stroke-width:1}
svg .mkdot{fill:var(--ink2);stroke:var(--surface);stroke-width:2}
svg .mkdot.warning{fill:var(--warn)} svg .mkdot.critical{fill:var(--bad)}
svg .mknum{fill:var(--surface);font-size:9px;font-weight:700}
svg .mkdot.warning + .mknum{fill:#0b0b0b}
svg .xh{stroke:var(--ink2);stroke-width:1;opacity:0}
svg .hov{fill:transparent}
svg .hit{fill:transparent}
svg .barg:hover .bar,svg .barg:hover .cell{opacity:.82}
svg .cellt{font-size:10px;font-weight:600} svg .cellt.dk{fill:#0b0b0b} svg .cellt.lt{fill:#fff}
svg.spark{vertical-align:middle}
${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `.s${i}{color:var(--s${i})} .f${i}{fill:var(--s${i});background:var(--s${i})} .k${i}{stroke:var(--s${i})}`).join('\n')}
svg .f1,svg .f2,svg .f3,svg .f4,svg .f5,svg .f6,svg .f7,svg .f8{background:none}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;color:var(--ink2);margin:2px 0 6px}
.lg{display:inline-flex;align-items:center;gap:6px}
i.sw{display:inline-block;width:14px;height:3px;border-radius:2px}
i.sw.bar{height:10px;width:10px;border-radius:3px}
ol.mklist{margin:6px 0 2px;padding:0 18px;font-size:12px;color:var(--ink2);columns:2 260px}
ol.mklist li.warning::marker{color:var(--warn)} ol.mklist li.critical::marker{color:var(--bad)}
table{border-collapse:collapse;width:100%;font-size:12.5px;font-variant-numeric:tabular-nums}
th,td{padding:5px 8px;border-bottom:1px solid var(--grid);text-align:end;white-space:nowrap}
th:first-child,td:first-child{text-align:start}
thead th{color:var(--ink2);font-weight:600;position:sticky;top:0;background:var(--surface)}
tbody tr:hover{background:var(--chip)}
tr.total td,tr.total th{font-weight:700;border-top:1px solid var(--axis)}
td.neg{color:var(--bad)}
.scroll{overflow-x:auto;max-height:520px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
details.tv{margin:2px 0 6px;font-size:12px;color:var(--ink2)}
details.tv summary{cursor:pointer}
.tvw{max-height:220px;overflow:auto;margin-top:6px}
.badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:0 9px;font-size:12px;font-weight:600;border:1px solid var(--border)}
.badge.ok{color:var(--good)} .badge.fail{color:var(--bad)}
.tt{position:fixed;z-index:20;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--axis);border-radius:8px;padding:6px 9px;font-size:12px;line-height:1.5;box-shadow:0 4px 14px rgba(0,0,0,.18);max-width:300px;direction:rtl;display:none}
.tt b{display:block;font-weight:600;margin-bottom:2px}
footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--grid);padding-top:12px}
@media (max-width:560px){h1{font-size:20px}.card .v{font-size:20px}.card.hero .v{font-size:28px}}
@media print{
  :root{color-scheme:light;${LIGHT}}
  body{background:#fff}.wrap{max-width:none;padding:0}
  button.theme,.tt,details.tv summary{display:none}
  details.tv{display:none}
  .panel,.card{break-inside:avoid}
  h2{break-after:avoid}
  .scroll{max-height:none;overflow:visible;border:none}
  thead th{position:static}
  svg .hov{display:none}
}
`

/** Hover tooltips (data-tip, pipe-separated lines) + crosshair for line charts + theme toggle. Wrapped in try/catch: the report works without it. */
export const REPORT_JS = `
(function(){try{
var tt=document.createElement('div');tt.className='tt';document.body.appendChild(tt);
function show(e,tip){var p=tip.split('|');tt.innerHTML='<b>'+esc(p[0])+'</b>'+p.slice(1).map(esc).join('<br>');tt.style.display='block';move(e)}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
function move(e){var x=e.clientX+14,y=e.clientY+14,w=tt.offsetWidth,h=tt.offsetHeight;if(x+w>innerWidth-8)x=e.clientX-w-14;if(y+h>innerHeight-8)y=e.clientY-h-14;tt.style.left=x+'px';tt.style.top=y+'px'}
function hide(){tt.style.display='none'}
document.addEventListener('mouseover',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(!t)return;show(e,t.getAttribute('data-tip'));
 if(t.classList.contains('hov')){var xh=t.ownerSVGElement.querySelector('.xh');if(xh){var x=t.getAttribute('data-x');xh.setAttribute('x1',x);xh.setAttribute('x2',x);xh.style.opacity=1}}});
document.addEventListener('mousemove',function(e){if(tt.style.display==='block')move(e)});
document.addEventListener('mouseout',function(e){var t=e.target.closest&&e.target.closest('[data-tip]');if(!t)return;hide();if(t.classList.contains('hov')){var xh=t.ownerSVGElement.querySelector('.xh');if(xh)xh.style.opacity=0}});
var b=document.querySelector('button.theme');if(b){b.addEventListener('click',function(){var r=document.documentElement;var cur=r.getAttribute('data-theme');var dark=cur?cur==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.setAttribute('data-theme',dark?'light':'dark')})}
}catch(e){}})();
`
