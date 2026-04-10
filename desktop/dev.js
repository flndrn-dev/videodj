#!/usr/bin/env node
const { spawn } = require('child_process')
const net = require('net')
const path = require('path')

const webDir = path.resolve(__dirname, '../web')
const npxPath = process.platform === 'win32' ? 'npx.cmd' : 'npx'

console.log('[Dev] Starting Next.js...')
const web = spawn(npxPath, ['next', 'dev', '--port', '3030'], {
  cwd: webDir,
  stdio: 'inherit',
})

web.on('error', (err) => {
  console.error('[Dev] Failed:', err.message)
  process.exit(1)
})

function waitForServer() {
  const s = new net.Socket()
  s.setTimeout(1000)
  s.on('connect', () => {
    s.destroy()
    console.log('[Dev] Web ready — launching Electron...')
    const electronBin = path.resolve(__dirname, '../node_modules/.bin/electron')
    const e = spawn(electronBin, ['.'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
    })
    e.on('close', (code) => { web.kill(); process.exit(code || 0) })
    e.on('error', (err) => { console.error('[Dev] Electron failed:', err.message); web.kill(); process.exit(1) })
  })
  s.on('timeout', () => { s.destroy(); setTimeout(waitForServer, 500) })
  s.on('error', () => { setTimeout(waitForServer, 500) })
  s.connect(3030, 'localhost')
}

waitForServer()
process.on('SIGINT', () => { web.kill(); process.exit(0) })
process.on('SIGTERM', () => { web.kill(); process.exit(0) })
