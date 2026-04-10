'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  ArrowDownRight,
  Link2,
  Unlink,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'

interface BalanceItem {
  amount: number
  currency: string
}

interface Charge {
  id: string
  amount: number
  currency: string
  status: string
  description: string
  customerEmail: string
  created: string
  refunded: boolean
  refundedAmount: number
  paid: boolean
}

interface Subscription {
  id: string
  customerId: string
  customerEmail: string
  status: string
  plan: string
  amount: number
  currency: string
  interval: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  created: string
}

interface FinanceData {
  connected: boolean
  error?: string
  mrr: number
  totalCustomers: number
  activeTrials: number
  churnRate: number
  recentCharges: Charge[]
  subscriptions: Subscription[]
  balance: { available: BalanceItem[]; pending: BalanceItem[] } | null
}

const statusColor: Record<string, string> = {
  succeeded: 'var(--status-green)',
  pending: '#f59e0b',
  failed: 'var(--status-red)',
  active: 'var(--status-green)',
  trialing: 'var(--system-blue)',
  canceled: 'var(--status-red)',
  past_due: '#f59e0b',
}

function formatCurrency(amount: number, currency = 'EUR') {
  const symbols: Record<string, string> = { EUR: '\u20ac', USD: '$', GBP: '\u00a3' }
  const sym = symbols[currency] || currency + ' '
  return `${sym}${amount.toFixed(2)}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function FinancePage() {
  const router = useRouter()
  const [data, setData] = useState<FinanceData | null>(null)
  const [loading, setLoading] = useState(true)

  // Stripe connection state
  const [stripeConnected, setStripeConnected] = useState(false)
  const [stripeMode, setStripeMode] = useState<'test' | 'live' | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [financeRes, connectRes] = await Promise.all([
        fetch('/api/finance'),
        fetch('/api/finance/connect'),
      ])
      const finance: FinanceData = await financeRes.json()
      const connect = await connectRes.json()

      setData(finance)
      setStripeConnected(connect.connected)
      setStripeMode(connect.mode)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const iv = setInterval(fetchData, 60_000)
    return () => clearInterval(iv)
  }, [fetchData])

  const handleConnect = async () => {
    if (!apiKey.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      const res = await fetch('/api/finance/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const result = await res.json()
      if (result.connected) {
        setStripeConnected(true)
        setStripeMode(result.mode)
        setApiKey('')
        fetchData()
      } else {
        setConnectError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectError('Network error')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/finance/connect', { method: 'DELETE' })
      setStripeConnected(false)
      setStripeMode(null)
      setData(null)
      fetchData()
    } catch {
      // silent
    } finally {
      setDisconnecting(false)
    }
  }

  // Build daily revenue chart data from recent charges
  const chartData = (() => {
    if (!data?.recentCharges?.length) return []
    const days: Record<string, number> = {}
    const now = Date.now()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86_400_000)
      days[d.toISOString().slice(0, 10)] = 0
    }
    for (const c of data.recentCharges) {
      if (c.status !== 'succeeded') continue
      const key = c.created.slice(0, 10)
      if (key in days) days[key] += c.amount
    }
    return Object.entries(days).map(([date, amount]) => ({ date, amount }))
  })()

  const maxChart = Math.max(...chartData.map(d => d.amount), 1)

  const balanceAvailable = data?.balance?.available?.reduce((s, b) => s + b.amount, 0) ?? 0
  const balancePending = data?.balance?.pending?.reduce((s, b) => s + b.amount, 0) ?? 0

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>Finance</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Revenue, subscriptions, and billing &mdash; powered by Stripe
        </p>
      </motion.div>

      {/* Stripe Connection Banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <AnimatePresence mode="wait">
          {stripeConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="glass-card glass-card--yellow p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)' }}>
                  <CheckCircle size={16} style={{ color: 'var(--status-green)' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Stripe Connected</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
                      style={{
                        background: stripeMode === 'live' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                        color: stripeMode === 'live' ? 'var(--status-green)' : 'var(--system-blue)',
                      }}
                    >
                      {stripeMode}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Receiving live data from Stripe API
                  </p>
                </div>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:brightness-110"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--status-red)' }}
              >
                {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
                Disconnect
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="disconnected"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="glass-card glass-card--yellow p-5"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-yellow-dim)' }}>
                  <Link2 size={16} style={{ color: 'var(--brand-yellow)' }} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Connect Stripe</h3>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    Enter your Stripe Secret Key (sk_test_... or sk_live_...)
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setConnectError('') }}
                    placeholder="sk_test_..."
                    onKeyDown={e => e.key === 'Enter' && handleConnect()}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: `1px solid ${connectError ? 'var(--status-red)' : 'var(--border-primary)'}`,
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/5"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={handleConnect}
                  disabled={connecting || !apiKey.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 disabled:opacity-40"
                  style={{ background: 'var(--brand-yellow)', color: '#000' }}
                >
                  {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  Connect
                </button>
              </div>
              <AnimatePresence>
                {connectError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="text-[11px] mt-2"
                    style={{ color: 'var(--status-red)' }}
                  >
                    {connectError}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: data?.mrr ?? 0, prefix: '\u20ac', icon: TrendingUp, accent: 'var(--status-green)', decimals: 2 },
          { label: 'Total Customers', value: data?.totalCustomers ?? 0, icon: Users, accent: 'var(--brand-yellow)' },
          { label: 'Active Trials', value: data?.activeTrials ?? 0, icon: CreditCard, accent: 'var(--system-blue)' },
          { label: 'Churn Rate', value: data?.churnRate ?? 0, suffix: '%', icon: ArrowDownRight, accent: 'var(--status-red)' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--yellow p-5">
            <div className="flex items-center justify-between mb-3">
              <stat.icon size={16} style={{ color: stat.accent }} />
            </div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</p>
            {stripeConnected ? (
              <p className="text-2xl font-bold" style={{ color: stat.accent }}>
                <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} decimals={stat.decimals} />
              </p>
            ) : (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Connect Stripe to see data</p>
            )}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Overview */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass-card glass-card--yellow p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp size={14} style={{ color: 'var(--brand-yellow)' }} />
            Revenue Overview
          </h3>

          {stripeConnected && data?.balance ? (
            <>
              <div className="flex gap-4 mb-4">
                <div className="flex-1 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Available</p>
                  <p className="text-lg font-bold font-mono" style={{ color: 'var(--status-green)' }}>
                    {formatCurrency(balanceAvailable)}
                  </p>
                </div>
                <div className="flex-1 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Pending</p>
                  <p className="text-lg font-bold font-mono" style={{ color: '#f59e0b' }}>
                    {formatCurrency(balancePending)}
                  </p>
                </div>
              </div>

              {chartData.length > 0 && (
                <>
                  <div className="h-36 flex items-end justify-between gap-[2px] px-1">
                    {chartData.map((d, i) => {
                      const h = d.amount > 0 ? Math.max(d.amount / maxChart, 0.04) : 0.02
                      return (
                        <motion.div
                          key={d.date}
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ delay: 0.3 + i * 0.015, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                          className="flex-1 rounded-t-sm origin-bottom"
                          title={`${d.date}: ${formatCurrency(d.amount)}`}
                          style={{
                            height: `${h * 100}%`,
                            background: d.amount > 0
                              ? `linear-gradient(to top, var(--brand-yellow-dim), rgba(255,255,0,${0.1 + h * 0.4}))`
                              : 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,0,0.08)',
                            borderBottom: 'none',
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>30 days ago</span>
                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>Today</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <DollarSign size={32} style={{ opacity: 0.15, color: 'var(--brand-yellow)' }} />
              <p className="text-xs">Connect Stripe to see real revenue data</p>
            </div>
          )}
        </motion.div>

        {/* Recent Transactions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card glass-card--yellow p-6 flex flex-col">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CreditCard size={14} style={{ color: 'var(--brand-yellow)' }} />
            Recent Transactions
          </h3>

          {stripeConnected && data?.recentCharges && data.recentCharges.length > 0 ? (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 space-y-1">
                {data.recentCharges.slice(0, 10).map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + i * 0.03 }}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-mono font-semibold"
                          style={{
                            color: 'var(--text-primary)',
                            textDecoration: c.refunded ? 'line-through' : 'none',
                            opacity: c.refunded ? 0.5 : 1,
                          }}
                        >
                          {formatCurrency(c.amount, c.currency)}
                        </span>
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase"
                          style={{
                            background: `${statusColor[c.status] || 'var(--text-tertiary)'}20`,
                            color: statusColor[c.status] || 'var(--text-tertiary)',
                          }}
                        >
                          {c.refunded ? 'refunded' : c.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {c.description}
                        </span>
                        {c.customerEmail && (
                          <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
                            &middot; {c.customerEmail}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 ml-3" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDateTime(c.created)}
                    </span>
                  </motion.div>
                ))}
              </div>
              <button
                onClick={() => router.push('/finance/transactions')}
                className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all hover:brightness-110"
                style={{ background: 'var(--bg-elevated)', color: 'var(--brand-yellow)', border: '1px solid var(--border-primary)' }}
              >
                View All Transactions
                <ExternalLink size={11} />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
              <DollarSign size={32} style={{ opacity: 0.2, color: 'var(--brand-yellow)' }} />
              <div className="text-center">
                <p className="text-sm">No transactions yet</p>
                {!stripeConnected && <p className="text-[11px] mt-1">Connect Stripe to see transaction data</p>}
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Active Subscriptions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card glass-card--yellow overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users size={14} style={{ color: 'var(--brand-yellow)' }} />
            Active Subscriptions
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            {data?.subscriptions?.length ?? 0} total
          </span>
        </div>
        <div
          className="grid gap-4 px-6 py-2 text-[10px] uppercase tracking-wider font-semibold"
          style={{
            gridTemplateColumns: '1fr 120px 80px 110px 80px',
            color: 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <span>Customer</span><span>Plan</span><span>Amount</span><span>Next Billing</span><span>Status</span>
        </div>

        {stripeConnected && data?.subscriptions && data.subscriptions.length > 0 ? (
          <div className="divide-y" style={{ borderColor: 'var(--border-primary)' }}>
            {data.subscriptions.map((sub, i) => (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 + i * 0.03 }}
                className="grid gap-4 px-6 py-3 text-xs hover:bg-white/[0.02] transition-colors"
                style={{ gridTemplateColumns: '1fr 120px 80px 110px 80px' }}
              >
                <span className="font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                  {sub.customerEmail || sub.customerId}
                </span>
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{sub.plan}</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {formatCurrency(sub.amount, sub.currency)}/{sub.interval === 'year' ? 'yr' : 'mo'}
                </span>
                <span className="font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {formatDate(sub.currentPeriodEnd)}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase w-fit"
                  style={{
                    background: `${statusColor[sub.status] || 'var(--text-tertiary)'}20`,
                    color: statusColor[sub.status] || 'var(--text-tertiary)',
                  }}
                >
                  {sub.status}
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-tertiary)' }}>
            <span className="text-sm">
              {stripeConnected ? 'No subscriptions found' : 'Connect Stripe to see subscriptions'}
            </span>
          </div>
        )}
      </motion.div>
    </div>
  )
}
