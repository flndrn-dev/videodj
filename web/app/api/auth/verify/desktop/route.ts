import { NextRequest } from 'next/server'
import { handleVerify } from '../../_verify-shared'

// The Electron main process loads this URL after receiving a videodj:// deep
// link. A token issued for 'web' will be rejected with a clear error page
// instead of signing anyone in.
export async function GET(req: NextRequest) {
  return handleVerify(req, 'desktop')
}
