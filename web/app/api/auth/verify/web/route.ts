import { NextRequest } from 'next/server'
import { handleVerify } from '../../_verify-shared'

// The URL clicked from a web-app magic-link email. A token issued for the
// Desktop App cannot be redeemed here — the user will be told to open the
// Desktop App and click their email button again from there.
export async function GET(req: NextRequest) {
  return handleVerify(req, 'web')
}
