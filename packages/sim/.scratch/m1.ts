import { Marketing, loadMarketingConfig } from '../src/marketing'
import { MS } from '@hiclaude/contracts'
const cfg = loadMarketingConfig({useResearch:false})
for (const budget of [30e6,100e6,300e6,1000e6]) {
  const m = new Marketing(cfg,{monthlyBudgetIrt:budget})
  let o
  for (let d=0; d<365; d++) o = m.step(MS.day)
  console.log(budget/1e6,'M visits/day', o!.channels.reduce((a,c)=>a+c.visitsPerDay,0).toFixed(0), o!.channels.map(c=>c.channel+':'+c.visitsPerDay.toFixed(0)+'/f'+c.fatigue.toFixed(2)).join(' '))
}
