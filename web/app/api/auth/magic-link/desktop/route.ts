import { NextRequest } from 'next/server'
import { handleMagicLinkRequest } from '../../_magic-link-shared'

// Desktop App-only magic link endpoint. The `client` is fixed to 'desktop'
// by the URL path — nothing in the request body can change that. The email
// sent from here only contains a videodj:// deep link.
export async function POST(req: NextRequest) {
  return handleMagicLinkRequest(req, 'desktop')
}
