const { execSync } = require('child_process')
const path = require('path')

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[afterPack] Fixing macOS app: ${appPath}`)

  try {
    // 1. Strip quarantine and extended attributes
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterPack] Extended attributes stripped')

    // 2. Ad-hoc code sign (no Apple Developer ID needed)
    // This prevents the "app is damaged" error on macOS
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterPack] Ad-hoc code signed successfully')
  } catch (err) {
    console.warn('[afterPack] Warning:', err.message)
    // Non-fatal — app may still work with manual bypass
  }
}
