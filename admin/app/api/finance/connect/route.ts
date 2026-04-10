import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY
  const hasKey = !!key

  let mode: 'test' | 'live' | null = null
  if (key) {
    mode = key.startsWith('sk_live_') ? 'live' : 'test'
  }

  return NextResponse.json({
    connected: hasKey,
    mode,
    hasKey,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey } = body

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid apiKey' },
        { status: 400 }
      )
    }

    if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
      return NextResponse.json(
        { error: 'Invalid Stripe key format. Must start with sk_test_ or sk_live_' },
        { status: 400 }
      )
    }

    // Create a temporary Stripe instance to verify the key
    const Stripe = require('stripe')
    const testStripe = new Stripe(apiKey)

    // Verify by retrieving the balance
    await testStripe.balance.retrieve()

    // Optionally fetch account name
    let accountName = ''
    try {
      const account = await testStripe.accounts.retrieve()
      accountName =
        account.settings?.dashboard?.display_name ||
        account.business_profile?.name ||
        account.email ||
        ''
    } catch {
      // Some keys may not have account access — that's fine
    }

    const mode = apiKey.startsWith('sk_live_') ? 'live' : 'test'

    // Store in process.env for runtime use (permanent config via Dokploy)
    process.env.STRIPE_SECRET_KEY = apiKey

    return NextResponse.json({
      connected: true,
      mode,
      accountName,
    })
  } catch (err) {
    console.error('Stripe connect error:', err)
    return NextResponse.json(
      {
        connected: false,
        error: (err as Error).message,
      },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  delete process.env.STRIPE_SECRET_KEY
  return NextResponse.json({ connected: false })
}
