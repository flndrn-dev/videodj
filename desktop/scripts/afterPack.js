const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[afterPack] Fixing macOS app: ${appPath}`)

  if (!fs.existsSync(appPath)) {
    console.error(`[afterPack] App not found at: ${appPath}`)
    return
  }

  try {
    // 1. Strip ALL extended attributes (quarantine, etc.)
    console.log('[afterPack] Stripping extended attributes...')
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })

    // 2. Ad-hoc code sign — signs the app without Apple Developer ID
    // --force: replace any existing signature
    // --deep: sign all nested frameworks and binaries
    // --sign -: ad-hoc signature (no certificate needed)
    console.log('[afterPack] Ad-hoc code signing...')
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })

    // 3. Verify the signature is valid
    console.log('[afterPack] Verifying signature...')
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterPack] Code signature verified OK')
  } catch (err) {
    // Make this FATAL so we know if signing fails
    console.error('[afterPack] CODE SIGNING FAILED:', err.message)
    throw err
  }
}
