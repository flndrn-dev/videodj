const { execSync } = require('child_process')
const path = require('path')

exports.default = async function(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[afterPack] Stripping extended attributes from ${appPath}`)
  try {
    execSync(`xattr -cr "${appPath}"`, { stdio: 'inherit' })
    console.log('[afterPack] Extended attributes stripped successfully')
  } catch (err) {
    console.warn('[afterPack] xattr strip failed:', err.message)
  }
}
