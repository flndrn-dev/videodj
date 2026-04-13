const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

exports.default = async function(context) {
  if (process.platform !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[afterPack] Fixing macOS app: ${appPath}`)

  if (!fs.existsSync(appPath)) {
    console.error(`[afterPack] App not found at: ${appPath}`)
    return
  }

  // 1. Remove broken symlinks that cause signing failures
  console.log('[afterPack] Removing broken symlinks...')
  execSync(`find "${appPath}" -type l ! -exec test -e {} \\; -delete 2>/dev/null || true`, { stdio: 'pipe' })

  // 2. Strip extended attributes — skip symlinks
  console.log('[afterPack] Stripping extended attributes...')
  execSync(`find "${appPath}" -not -type l -exec xattr -c {} + 2>/dev/null || true`, { stdio: 'pipe' })

  // 3. Ad-hoc code sign — prevents "file is damaged" on macOS
  console.log('[afterPack] Ad-hoc code signing...')
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  console.log('[afterPack] Done')
}
