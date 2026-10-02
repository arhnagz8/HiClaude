/** TanStack Query hooks — one per endpoint in api-spec.md (customer section). */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { MeDto, OrderCreate, OrderDto, ProductDto, PublicConfigDto, QuoteDto, QuoteRequest, ReceiptInput, RevealDto, TicketDto } from '@hiclaude/contracts'
import { api, setAuthToken } from './client'
import { openSse } from './sse'
import { qk } from './keys'
import type { AuthResult, OtpRequestResult, ReferralDto, RevealRequest, WalletDto, WalletTopupResult } from './extra-types'
import { newIdempotencyKey } from '../lib/idempotency'

// ───────────── queries ─────────────
export function usePublicConfig() {
  return useQuery({ queryKey: qk.config, queryFn: ({ signal }) => api.get<PublicConfigDto>('/public/config', undefined, signal), refetchInterval: 20_000, staleTime: 10_000, refetchOnWindowFocus: true })
}

export function useCatalog() {
  return useQuery({ queryKey: qk.catalog, queryFn: ({ signal }) => api.get<ProductDto[]>('/catalog', undefined, signal), refetchInterval: 60_000, staleTime: 30_000 })
}

/** Product by slug OR id: renders instantly from the cached catalog, refines with GET /catalog/:id. */
export function useProduct(slugOrId: string | undefined) {
  const catalog = useCatalog()
  const listed = catalog.data?.find((p) => p.slug === slugOrId || p.id === slugOrId)
  const detail = useQuery({
    queryKey: qk.product(listed?.id ?? slugOrId ?? ''),
    queryFn: ({ signal }) => api.get<ProductDto>(`/catalog/${listed?.id ?? slugOrId}`, undefined, signal),
    enabled: !!slugOrId && (catalog.isSuccess || catalog.isError),
    initialData: listed,
    staleTime: 30_000,
    retry: false,
  })
  return { product: detail.data ?? listed, isLoading: catalog.isLoading || (detail.isLoading && !listed), isError: detail.isError && !listed, error: detail.error }
}

export function useMe(enabled = true) {
  return useQuery({ queryKey: qk.me, queryFn: ({ signal }) => api.get<MeDto>('/me', undefined, signal), enabled, retry: false, staleTime: 60_000 })
}

export function useOrders(enabled = true) {
  return useQuery({ queryKey: qk.orders, queryFn: ({ signal }) => api.get<OrderDto[]>('/orders', undefined, signal), enabled, refetchInterval: 30_000 })
}

export function useOrder(id: string | undefined, refetchMs: number | false = false) {
  return useQuery({ queryKey: qk.order(id ?? ''), queryFn: ({ signal }) => api.get<OrderDto>(`/orders/${id}`, undefined, signal), enabled: !!id, refetchInterval: refetchMs })
}

export function useWallet(enabled = true) {
  return useQuery({ queryKey: qk.wallet, queryFn: ({ signal }) => api.get<WalletDto>('/wallet', undefined, signal), enabled })
}
export function useReferral(enabled = true) {
  return useQuery({ queryKey: qk.referral, queryFn: ({ signal }) => api.get<ReferralDto>('/referral', undefined, signal), enabled })
}
export function useTickets(enabled = true) {
  return useQuery({ queryKey: qk.tickets, queryFn: ({ signal }) => api.get<TicketDto[]>('/tickets', undefined, signal), enabled })
}

// ───────────── quote (imperative; used by useLiveQuote) ─────────────
export function postQuote(req: QuoteRequest, signal?: AbortSignal): Promise<QuoteDto> {
  return api.post<QuoteDto>('/quotes', req, { signal })
}

// ───────────── mutations ─────────────
function refreshOrder(qc: QueryClient, o: OrderDto): void {
  qc.setQueryData(qk.order(o.id), o)
  void qc.invalidateQueries({ queryKey: qk.orders })
}

export function useRequestOtp() {
  return useMutation({ mutationFn: (phone: string) => api.post<OtpRequestResult>('/auth/otp/request', { phone }, { noAuthHandling: true }) })
}
export function useVerifyOtp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { phone: string; code: string; referralCode?: string }) => api.post<AuthResult>('/auth/otp/verify', v, { noAuthHandling: true }),
    onSuccess: (r) => {
      if (r.token) setAuthToken(r.token)
      qc.setQueryData(qk.me, r.me)
    },
  })
}
export function useMessengerAuth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { platform: 'telegram' | 'bale'; initData: string; referralCode?: string }) => api.post<AuthResult>('/auth/messenger', v, { noAuthHandling: true }),
    onSuccess: (r) => {
      if (r.token) setAuthToken(r.token)
      qc.setQueryData(qk.me, r.me)
    },
  })
}
export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout', {}, { noAuthHandling: true }),
    onSettled: () => {
      setAuthToken(null)
      qc.removeQueries({ queryKey: qk.me })
      qc.removeQueries({ queryKey: qk.orders })
      qc.removeQueries({ queryKey: qk.wallet })
      qc.removeQueries({ queryKey: qk.tickets })
    },
  })
}

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { name: string }) => api.patch<MeDto>('/me', v), onSuccess: (me) => qc.setQueryData(qk.me, me) })
}
export function useSubmitKyc() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { nationalId: string; fullName: string }) => api.post<MeDto>('/me/kyc', v), onSuccess: (me) => qc.setQueryData(qk.me, me) })
}

/** Creates an order. The idempotency key is supplied by the caller (one per checkout intent) so retries never double-charge. */
export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { body: OrderCreate; idempotencyKey: string }) => api.post<OrderDto>('/orders', v.body, { idempotencyKey: v.idempotencyKey }),
    onSuccess: (o) => {
      refreshOrder(qc, o)
      void qc.invalidateQueries({ queryKey: qk.me })
      void qc.invalidateQueries({ queryKey: qk.wallet })
    },
  })
}
export function useSubmitReceipt(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { body: ReceiptInput; idempotencyKey?: string }) => api.post<OrderDto>(`/orders/${orderId}/receipt`, v.body, { idempotencyKey: v.idempotencyKey ?? newIdempotencyKey('rcpt') }),
    onSuccess: (o) => refreshOrder(qc, o),
  })
}
function useOrderAction(orderId: string, action: 'cancel' | 'confirm' | 'dispute') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body?: { reasonFa: string }) => api.post<OrderDto>(`/orders/${orderId}/${action}`, body ?? {}),
    onSuccess: (o) => refreshOrder(qc, o),
  })
}
export const useCancelOrder = (id: string) => useOrderAction(id, 'cancel')
export const useConfirmOrder = (id: string) => useOrderAction(id, 'confirm')
export const useDisputeOrder = (id: string) => useOrderAction(id, 'dispute')

/** One-time secure reveal. Result is NOT cached in the query client (secrets stay in component state only). */
export function useRevealRequest(orderId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: RevealRequest) => api.post<RevealDto>(`/orders/${orderId}/reveal`, v),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.order(orderId) }),
    gcTime: 0,
  })
}

export function useWalletTopup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { amountIrt: number; method: 'gateway' | 'card_to_card'; idempotencyKey: string }) =>
      api.post<WalletTopupResult>('/wallet/topup', { amountIrt: v.amountIrt, method: v.method }, { idempotencyKey: v.idempotencyKey }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.wallet }),
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (v: { subject: string; message: string; orderId?: string }) => api.post<TicketDto>('/tickets', v), onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tickets }) })
}
export function useTicketMessage(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (message: string) => api.post<TicketDto>(`/tickets/${ticketId}/messages`, { message }), onSuccess: () => void qc.invalidateQueries({ queryKey: qk.tickets }) })
}

// ───────────── SSE ─────────────
/** Subscribes to /orders/:id/stream; every event refreshes the cached order. While disconnected the order is polled. */
export function useOrderStream(orderId: string | undefined, enabled = true): { connected: boolean } {
  const qc = useQueryClient()
  const [connected, setConnected] = useState(false)
  const idRef = useRef(orderId)
  idRef.current = orderId
  useEffect(() => {
    if (!orderId || !enabled) return
    const close = openSse({
      path: `/orders/${orderId}/stream`,
      onStatus: setConnected,
      onMessage: (m) => {
        if (m.event === 'ping' || m.event === 'heartbeat') return
        try {
          const data = JSON.parse(m.data) as Partial<OrderDto> & { order?: OrderDto }
          const order = data.order ?? (data.id && data.status ? (data as OrderDto) : undefined)
          if (order) qc.setQueryData(qk.order(orderId), order)
          else void qc.invalidateQueries({ queryKey: qk.order(orderId) })
        } catch {
          void qc.invalidateQueries({ queryKey: qk.order(orderId) })
        }
        void qc.invalidateQueries({ queryKey: qk.orders })
      },
    })
    return () => {
      close()
      setConnected(false)
    }
  }, [orderId, enabled, qc])
  return { connected }
}
