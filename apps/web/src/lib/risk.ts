/** Checkout gating: high-risk products require explicit acknowledgement; kill-switch / stale quote / invalid inputs block too. */
import type { PaymentMethod, ProductDto, QuoteDto, RateStatus } from '@hiclaude/contracts'
import { isExpired, methodOf } from './quote'

export type BlockCode = 'kill_switch' | 'rates_unavailable' | 'no_quote' | 'quote_expired' | 'amount_invalid' | 'inputs_invalid' | 'risk_ack' | 'price_changed' | 'no_method' | 'method_unavailable' | 'rush_unavailable' | 'inactive'

export interface GateInput {
  product?: Pick<ProductDto, 'riskLabel' | 'active'>
  quote?: QuoteDto
  now: number
  riskAck: boolean
  amountValid: boolean
  inputsValid: boolean
  priceAcknowledged: boolean
  method?: PaymentMethod
  killSwitch?: boolean
  rateStatus?: RateStatus
  rushAvailable?: boolean
}

export function requiresRiskAck(p: Pick<ProductDto, 'riskLabel'> | undefined): boolean {
  return p?.riskLabel === 'high'
}

export function checkoutBlockers(i: GateInput): BlockCode[] {
  const out: BlockCode[] = []
  if (i.killSwitch || i.rateStatus === 'killed') out.push('kill_switch')
  else if (i.rateStatus === 'stale') out.push('rates_unavailable')
  if (i.product && !i.product.active) out.push('inactive')
  if (!i.amountValid) out.push('amount_invalid')
  if (!i.inputsValid) out.push('inputs_invalid')
  if (i.rushAvailable === false) out.push('rush_unavailable')
  if (!i.quote) out.push('no_quote')
  else if (isExpired(i.quote, i.now)) out.push('quote_expired')
  if (requiresRiskAck(i.product) && !i.riskAck) out.push('risk_ack')
  if (!i.priceAcknowledged) out.push('price_changed')
  if (i.method !== undefined) {
    const m = methodOf(i.quote, i.method)
    if (i.quote && (!m || !m.available)) out.push('method_unavailable')
  }
  return out
}

export const canCheckout = (i: GateInput): boolean => checkoutBlockers(i).length === 0
