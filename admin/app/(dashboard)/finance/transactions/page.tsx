'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Search,
  CreditCard,
  DollarSign,
  RotateCcw,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

interface Charge {
  id: string
  amount: number
  currency: string
  status: string
  description: string
  customerEmail: string
  customerId: string
  created: string
  refunded: boolean
  refundedAmount: number
  paid: boolean
  paymentMethod: string
  receiptUrl: string | null
}

interface BalanceItem {
  amount: number
  currency: string
}

const statusColor: Record<string, string> = {
  succeeded: 'var(--status-green)',
  pending: '#f59e0b',
  failed: 'var(--status-red)',
}

function formatCurrency(amount: number, currency = 'EUR') {
  const symbols: Record<string, string> = { EUR: '\u20ac', USD: '$', GBP: '\u00a3' }
  const sym = symbols[currency] || currency + ' '
  return `${sym}${amount.toFixed(2)}`
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

type StatusFilter = 'all' | 'succeeded' | 'pending' | 'failed' | 'refunded'

export default function TransactionsPage() {
  const router = useRouter()
  const [charges, setCharges] = useState<Charge[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [connected, setConnected] = useState(false)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  // Balance
  const [balanceAvailable, setBalanceAvailable] = useState(0)
  const [balancePending, setBalancePending] = useState(0)

  // Refund modal
  const [refundTarget, setRefundTarget] = useState<Charge | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refunding, setRefunding] = useState(false)

  const fetchCharges = useCallback(async (startingAfter?: string) => {
    if (startingAfter) setLoadingMore(true)
    else setLoading(true)

    try {
      const params = new URLSearchParams({ limit: '50' })
      if (startingAfter) params.set('starting_after', startingAfter)

      const res = await fetch(`/api/finance/transactions?${params}`)
      const data = await res.json()

      setConnected(data.connected)
      setHasMore(data.hasMore)

      if (startingAfter) {
        setCharges(prev => [...prev, ...data.charges])
      } else {
        setCharges(data.charges || [])
      }
    } catch {
      toast.error('Failed to fetch transactions')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/finance')
      const data = await res.json()
      if (data.balance) {
        setBalanceAvailable(data.balance.available?.reduce((s: number, b: BalanceItem) => s + b.amount, 0) ?? 0)
        setBalancePending(data.balance.pending?.reduce((s: number, b: BalanceItem) => s + b.amount, 0) ?? 0)
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchCharges()
    fetchBalance()
  }, [fetchCharges, fetchBalance])

  const handleLoadMore = () => {
    const last = charges[charges.length - 1]
    if (last) fetchCharges(last.id)
  }

  const handleRefund = async () => {
    if (!refundTarget) return
    const amount = parseFloat(refundAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid refund amount')
      return
    }
    if (amount > refundTarget.amount - refundTarget.refundedAmount) {
      toast.error('Amount exceeds refundable balance')
      return
    }

    setRefunding(true)
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refund',
          chargeId: refundTarget.id,
          amount,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Refunded ${formatCurrency(amount, refundTarget.currency)} successfully`)
        setRefundTarget(null)
        setRefundAmount('')
        // Refresh charges
        fetchCharges()
      } else {
        toast.error(data.error || 'Refund failed')
      }
    } catch {
      toast.error('Network error during refund')
    } finally {
      setRefunding(false)
    }
  }

  // Filter charges
  const filtered = charges.filter(c => {
    if (statusFilter === 'refunded' && !c.refunded) return false
    if (statusFilter === 'succeeded' && (c.status !== 'succeeded' || c.refunded)) return false
    if (statusFilter === 'pending' && c.status !== 'pending') return false
    if (statusFilter === 'failed' && c.status !== 'failed') return false

    if (search) {
      const q = search.toLowerCase()
      return (
        (c.description || '').toLowerCase().includes(q) ||
        (c.customerEmail || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const filterButtons: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Succeeded', value: 'succeeded' },
    { label: 'Pending', value: 'pending' },
    { label: 'Failed', value: 'failed' },
    { label: 'Refunded', value: 'refunded' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
        <button
          onClick={() => router.push('/finance')}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:brightness-110"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}
        >
          <ArrowLeft size={14} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div>
          <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>All Transactions</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {charges.length} transactions loaded
          </p>
        </div>
      </motion.div>

      {/* Balance bar */}
      {connected && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 gap-4">
          <div className="glass-card glass-card--yellow p-4">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Available Balance</p>
            <p className="text-xl font-bold font-mono" style={{ color: 'var(--status-green)' }}>
              {formatCurrency(balanceAvailable)}
            </p>
          </div>
          <div className="glass-card glass-card--yellow p-4">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Pending Balance</p>
            <p className="text-xl font-bold font-mono" style={{ color: '#f59e0b' }}>
              {formatCurrency(balancePending)}
            </p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
          {filterButtons.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-all"
              style={{
                background: statusFilter === f.value ? 'var(--brand-yellow)' : 'transparent',
                color: statusFilter === f.value ? '#000' : 'var(--text-tertiary)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by description or email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs outline-none"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </motion.div>

      {/* Transactions table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="glass-card glass-card--yellow overflow-hidden">
        {/* Table header */}
        <div
          className="grid gap-4 px-6 py-3 text-[10px] uppercase tracking-wider font-semibold"
          style={{
            gridTemplateColumns: '130px 100px 60px 80px 1fr 160px 90px',
            color: 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <span>Date</span>
          <span>Amount</span>
          <span>Cur.</span>
          <span>Status</span>
          <span>Description</span>
          <span>Customer</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand-yellow)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <CreditCard size={28} style={{ opacity: 0.15 }} />
            <p className="text-sm">{connected ? 'No transactions match your filters' : 'Connect Stripe to see transactions'}</p>
          </div>
        ) : (
          <div>
            {filtered.map((c, i) => {
              const refundable = c.status === 'succeeded' && !c.refunded && c.refundedAmount < c.amount
              const isPartialRefund = c.refundedAmount > 0 && !c.refunded

              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className="grid gap-4 px-6 py-3 text-xs hover:bg-white/[0.02] transition-colors items-center"
                  style={{
                    gridTemplateColumns: '130px 100px 60px 80px 1fr 160px 90px',
                    borderBottom: '1px solid var(--border-primary)',
                  }}
                >
                  {/* Date */}
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {formatDateTime(c.created)}
                  </span>

                  {/* Amount */}
                  <span
                    className="font-mono font-semibold"
                    style={{
                      color: 'var(--text-primary)',
                      textDecoration: c.refunded ? 'line-through' : 'none',
                      opacity: c.refunded ? 0.5 : 1,
                    }}
                  >
                    {formatCurrency(c.amount, c.currency)}
                    {isPartialRefund && (
                      <span className="block text-[10px] font-normal" style={{ color: '#a855f7' }}>
                        (-{formatCurrency(c.refundedAmount, c.currency)})
                      </span>
                    )}
                  </span>

                  {/* Currency */}
                  <span className="font-mono text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                    {c.currency}
                  </span>

                  {/* Status */}
                  <span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase inline-block"
                      style={{
                        background: c.refunded
                          ? 'rgba(168,85,247,0.15)'
                          : `${statusColor[c.status] || 'var(--text-tertiary)'}20`,
                        color: c.refunded
                          ? '#a855f7'
                          : statusColor[c.status] || 'var(--text-tertiary)',
                      }}
                    >
                      {c.refunded ? 'refunded' : c.status}
                    </span>
                  </span>

                  {/* Description */}
                  <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                    {c.description}
                  </span>

                  {/* Customer */}
                  <span className="font-mono text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {c.customerEmail || c.customerId || '\u2014'}
                  </span>

                  {/* Actions */}
                  <div>
                    {refundable && (
                      <button
                        onClick={() => {
                          setRefundTarget(c)
                          setRefundAmount((c.amount - c.refundedAmount).toFixed(2))
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all hover:brightness-110"
                        style={{ background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}
                      >
                        <RotateCcw size={10} />
                        Refund
                      </button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* Load More */}
      {hasMore && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-medium transition-all hover:brightness-110 disabled:opacity-40"
            style={{ background: 'var(--bg-elevated)', color: 'var(--brand-yellow)', border: '1px solid var(--border-primary)' }}
          >
            {loadingMore ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
            Load More Transactions
          </button>
        </motion.div>
      )}

      {/* Refund Modal */}
      <AnimatePresence>
        {refundTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            onClick={() => setRefundTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="glass-card glass-card--yellow p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Confirm Refund</h3>
                </div>
                <button
                  onClick={() => setRefundTarget(null)}
                  className="p-1 rounded hover:bg-white/5"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X size={14} />
                </button>
              </div>

              <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                Refund {formatCurrency(refundTarget.amount, refundTarget.currency)} to{' '}
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {refundTarget.customerEmail || refundTarget.customerId}
                </span>
                ?
              </p>

              <div className="mb-4">
                <label className="text-[10px] uppercase tracking-wider font-semibold mb-1.5 block" style={{ color: 'var(--text-tertiary)' }}>
                  Refund Amount ({refundTarget.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(refundTarget.amount - refundTarget.refundedAmount).toFixed(2)}
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Max refundable: {formatCurrency(refundTarget.amount - refundTarget.refundedAmount, refundTarget.currency)}
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRefundTarget(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:brightness-110"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefund}
                  disabled={refunding}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-40"
                  style={{ background: '#a855f7', color: '#fff' }}
                >
                  {refunding ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Confirm Refund
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
