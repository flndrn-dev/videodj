'use client'

import { motion } from 'framer-motion'
import { DollarSign, TrendingUp, Users, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter'

export default function FinancePage() {
  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-xl font-bold glow-yellow" style={{ color: 'var(--brand-yellow)' }}>Finance</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Revenue, subscriptions, and billing — powered by Mavi Pay / Stripe
        </p>
      </motion.div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: 0, prefix: '€', icon: TrendingUp, accent: 'var(--status-green)', change: '+0%' },
          { label: 'Total Customers', value: 0, icon: Users, accent: 'var(--brand-yellow)', change: '—' },
          { label: 'Active Trials', value: 0, icon: CreditCard, accent: 'var(--system-blue)', change: '—' },
          { label: 'Churn Rate', value: 0, suffix: '%', icon: ArrowDownRight, accent: 'var(--status-red)', change: '—' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            className="glass-card glass-card--yellow p-5">
            <div className="flex items-center justify-between mb-3">
              <stat.icon size={16} style={{ color: stat.accent }} />
              <span className="text-[10px] font-mono flex items-center gap-0.5"
                style={{ color: stat.change.startsWith('+') ? 'var(--status-green)' : 'var(--text-tertiary)' }}>
                {stat.change}
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{stat.label}</p>
            <p className="text-2xl font-bold" style={{ color: stat.accent }}>
              <AnimatedCounter value={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue chart placeholder */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass-card glass-card--yellow p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <TrendingUp size={14} style={{ color: 'var(--brand-yellow)' }} />
            Revenue Overview
          </h3>
          {/* Chart area */}
          <div className="h-48 flex items-end justify-between gap-1 px-2">
            {Array.from({ length: 30 }, (_, i) => {
              const h = Math.random() * 0.3 + 0.02
              return (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ delay: 0.3 + i * 0.02, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex-1 rounded-t-sm origin-bottom"
                  style={{
                    height: `${h * 100}%`,
                    background: `linear-gradient(to top, var(--brand-yellow-dim), rgba(255,255,0,${0.05 + h * 0.3}))`,
                    border: '1px solid rgba(255,255,0,0.1)',
                    borderBottom: 'none',
                  }}
                />
              )
            })}
          </div>
          <div className="flex justify-between mt-2 px-2">
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>30 days ago</span>
            <span className="text-[9px] font-mono" style={{ color: 'var(--text-tertiary)' }}>Today</span>
          </div>
          <p className="text-center text-xs mt-4" style={{ color: 'var(--text-tertiary)' }}>
            Connect Mavi Pay to see real revenue data
          </p>
        </motion.div>

        {/* Transactions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-card glass-card--yellow p-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <CreditCard size={14} style={{ color: 'var(--brand-yellow)' }} />
            Recent Transactions
          </h3>
          <div className="flex flex-col items-center justify-center py-12 gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <DollarSign size={32} style={{ opacity: 0.2, color: 'var(--brand-yellow)' }} />
            <div className="text-center">
              <p className="text-sm">No transactions yet</p>
              <p className="text-[11px] mt-1">Mavi Pay integration coming soon (~1 week)</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Subscription table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="glass-card glass-card--yellow overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Users size={14} style={{ color: 'var(--brand-yellow)' }} />
            Active Subscriptions
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded font-mono" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            0 active
          </span>
        </div>
        <div className="grid grid-cols-[1fr_100px_80px_100px_80px] gap-4 px-6 py-2 text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-primary)' }}>
          <span>Customer</span><span>Plan</span><span>Amount</span><span>Next Billing</span><span>Status</span>
        </div>
        <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-tertiary)' }}>
          <span className="text-sm">Subscriptions will appear when Mavi Pay is connected</span>
        </div>
      </motion.div>
    </div>
  )
}
