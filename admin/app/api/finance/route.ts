import { NextResponse } from 'next/server'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const Stripe = require('stripe')
  return new Stripe(key)
}

export async function GET() {
  const stripe = getStripe()

  if (!stripe) {
    return NextResponse.json({
      connected: false,
      mrr: 0,
      totalCustomers: 0,
      activeTrials: 0,
      churnRate: 0,
      recentCharges: [],
      subscriptions: [],
      balance: null,
    })
  }

  try {
    // Fetch real Stripe data in parallel
    const [charges, subscriptions, customers, balance] = await Promise.all([
      stripe.charges.list({ limit: 20 }),
      stripe.subscriptions.list({ limit: 50, status: 'all' }),
      stripe.customers.list({ limit: 100 }),
      stripe.balance.retrieve(),
    ])

    // Calculate MRR from active subscriptions
    const activeSubs = subscriptions.data.filter(
      (s: any) => s.status === 'active'
    )
    const mrr =
      activeSubs.reduce((sum: number, s: any) => {
        const item = s.items?.data?.[0]
        if (!item) return sum
        const amount = item.price?.unit_amount || 0
        const interval = item.price?.recurring?.interval
        if (interval === 'year') return sum + amount / 12
        return sum + amount // monthly
      }, 0) / 100 // Convert cents to currency

    const activeTrials = subscriptions.data.filter(
      (s: any) => s.status === 'trialing'
    ).length
    const canceled = subscriptions.data.filter(
      (s: any) => s.status === 'canceled'
    ).length
    const churnRate =
      subscriptions.data.length > 0
        ? Math.round((canceled / subscriptions.data.length) * 100)
        : 0

    // Map charges to simple format
    const recentCharges = charges.data.map((c: any) => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency.toUpperCase(),
      status: c.status,
      description: c.description || c.statement_descriptor || 'Payment',
      customerEmail: c.billing_details?.email || c.receipt_email || '',
      created: new Date(c.created * 1000).toISOString(),
      refunded: c.refunded,
      refundedAmount: (c.amount_refunded || 0) / 100,
      paid: c.paid,
    }))

    // Map subscriptions
    const subList = subscriptions.data.map((s: any) => ({
      id: s.id,
      customerId: s.customer,
      customerEmail: '',
      status: s.status,
      plan:
        s.items?.data?.[0]?.price?.nickname ||
        s.items?.data?.[0]?.price?.id ||
        'Unknown',
      amount: (s.items?.data?.[0]?.price?.unit_amount || 0) / 100,
      currency: (s.items?.data?.[0]?.price?.currency || 'eur').toUpperCase(),
      interval: s.items?.data?.[0]?.price?.recurring?.interval || 'month',
      currentPeriodEnd: new Date(
        (s.current_period_end || 0) * 1000
      ).toISOString(),
      cancelAtPeriodEnd: s.cancel_at_period_end,
      created: new Date(s.created * 1000).toISOString(),
    }))

    // Balance
    const balanceData = {
      available: balance.available.map((b: any) => ({
        amount: b.amount / 100,
        currency: b.currency.toUpperCase(),
      })),
      pending: balance.pending.map((b: any) => ({
        amount: b.amount / 100,
        currency: b.currency.toUpperCase(),
      })),
    }

    return NextResponse.json({
      connected: true,
      mrr,
      totalCustomers: customers.data.length,
      activeTrials,
      churnRate,
      recentCharges,
      subscriptions: subList,
      balance: balanceData,
    })
  } catch (err) {
    console.error('Stripe fetch error:', err)
    return NextResponse.json({
      connected: true,
      error: (err as Error).message,
      mrr: 0,
      totalCustomers: 0,
      activeTrials: 0,
      churnRate: 0,
      recentCharges: [],
      subscriptions: [],
      balance: null,
    })
  }
}
