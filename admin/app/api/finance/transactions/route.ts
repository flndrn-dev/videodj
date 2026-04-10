import { NextRequest, NextResponse } from 'next/server'

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const Stripe = require('stripe')
  return new Stripe(key)
}

export async function GET(request: NextRequest) {
  const stripe = getStripe()

  if (!stripe) {
    return NextResponse.json({
      connected: false,
      charges: [],
      hasMore: false,
    })
  }

  const { searchParams } = request.nextUrl
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const startingAfter = searchParams.get('starting_after') || undefined

  try {
    const params: any = { limit }
    if (startingAfter) {
      params.starting_after = startingAfter
    }

    const charges = await stripe.charges.list(params)

    const chargeList = charges.data.map((c: any) => ({
      id: c.id,
      amount: c.amount / 100,
      currency: c.currency.toUpperCase(),
      status: c.status,
      description: c.description || c.statement_descriptor || 'Payment',
      customerEmail: c.billing_details?.email || c.receipt_email || '',
      customerId: c.customer || '',
      created: new Date(c.created * 1000).toISOString(),
      refunded: c.refunded,
      refundedAmount: (c.amount_refunded || 0) / 100,
      paid: c.paid,
      paymentMethod: c.payment_method_details?.type || 'unknown',
      receiptUrl: c.receipt_url || null,
    }))

    return NextResponse.json({
      connected: true,
      charges: chargeList,
      hasMore: charges.has_more,
    })
  } catch (err) {
    console.error('Stripe transactions fetch error:', err)
    return NextResponse.json(
      { connected: true, error: (err as Error).message, charges: [], hasMore: false },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const stripe = getStripe()

  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe not connected' },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const { action, chargeId, amount } = body

    if (!action || !chargeId) {
      return NextResponse.json(
        { error: 'Missing required fields: action, chargeId' },
        { status: 400 }
      )
    }

    if (action === 'refund') {
      const refundParams: any = { charge: chargeId }
      if (amount) {
        // amount is expected in the main currency unit (e.g. euros), convert to cents
        refundParams.amount = Math.round(amount * 100)
      }

      const refund = await stripe.refunds.create(refundParams)

      return NextResponse.json({
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount / 100,
          currency: refund.currency.toUpperCase(),
          status: refund.status,
          chargeId: refund.charge,
          created: new Date(refund.created * 1000).toISOString(),
        },
      })
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    )
  } catch (err) {
    console.error('Stripe transaction action error:', err)
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
