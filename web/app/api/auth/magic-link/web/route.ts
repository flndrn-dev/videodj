import { NextRequest } from 'next/server'
import { handleMagicLinkRequest } from '../../_magic-link-shared'

// Web App-only magic link endpoint. The email sent from here only contains
// an https://app.videodj.studio/... link — no desktop protocol URL.
export async function POST(req: NextRequest) {
  return handleMagicLinkRequest(req, 'web')
}
