export const qk = {
  config: ['config'] as const,
  catalog: ['catalog'] as const,
  product: (id: string) => ['product', id] as const,
  me: ['me'] as const,
  orders: ['orders'] as const,
  order: (id: string) => ['order', id] as const,
  wallet: ['wallet'] as const,
  referral: ['referral'] as const,
  tickets: ['tickets'] as const,
}
