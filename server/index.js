import http from 'node:http'
import { WebSocketServer } from 'ws'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGS, ENV, KOTLIN_IMAGE } from './languages.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '127.0.0.1'
const MAX_RUNS = Number(process.env.MAX_RUNS || 4)
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 5 * 60 * 1000)
const MAX_CODE = 100_000
const MAX_OUTPUT = 200_000
// For a public site, set ALLOWED_ORIGINS=https://yoursite.com
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

const DOCKER_HELP =
  'Docker is not running.\n' +
  '1. Open "Docker Desktop" from the Start menu.\n' +
  '2. Wait until it says "Engine running" (bottom-left).\n' +
  '3. Click Run again.\n' +
  '(Not installed yet? In a terminal run:  winget install -e --id Docker.DockerDesktop  then restart your PC.)\n'

let active = 0

// ---------- helpers ----------
function runDocker(args, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r) } }
    let p
    try { p = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch (e) { return resolve({ code: -1, out: String(e), missing: true }) }
    const t = setTimeout(() => { p.kill(); finish({ code: -1, out, timeout: true }) }, timeout)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('error', (e) => finish({ code: -1, out: String(e), missing: e.code === 'ENOENT' }))
    p.on('close', (code) => finish({ code, out }))
  })
}

let dockerCache = { at: 0, value: null }
async function dockerStatus() {
  if (Date.now() - dockerCache.at < 3000 && dockerCache.value) return dockerCache.value
  const r = await runDocker(['info', '--format', '{{.ServerVersion}}'], { timeout: 6000 })
  const value = r.code === 0 ? 'ready' : r.missing ? 'missing' : 'stopped'
  dockerCache = { at: Date.now(), value }
  return value
}

function streamCommand(args, send, opts = {}) {
  // Runs a docker command (pull/build) and forwards its progress to the page
  return new Promise((resolve) => {
    let p
    try { p = spawn('docker', args, { cwd: opts.cwd }) } catch { return resolve(1) }
    let last = ''
    const forward = (d) => {
      const text = String(d)
      const line = text.trim().split(/\r?\n/).pop() || ''
      if (line && line !== last && line.length < 200) { last = line; send({ type: 'out', text: '  ' + line + '\n' }) }
    }
    p.stdout.on('data', forward)
    p.stderr.on('data', forward)
    p.on('error', () => resolve(1))
    p.on('close', (c) => resolve(c))
  })
}

async function ensureImage(L, send) {
  const have = await runDocker(['image', 'inspect', L.image])
  if (have.code === 0) return true
  const isKotlin = L.image === KOTLIN_IMAGE
  send({
    type: 'out',
    text: `First time using this language: downloading its tools (one-time, can take several minutes)...\n`,
  })
  const code = isKotlin
    ? await streamCommand(['build', '-t', KOTLIN_IMAGE, path.join(ROOT, 'docker', 'kotlin')], send)
    : await streamCommand(['pull', L.image], send)
  if (code !== 0) {
    send({ type: 'out', text: `\nCould not download "${L.image}". Check your internet connection and try again.\n` })
    return false
  }
  send({ type: 'out', text: 'Download finished.\n\n' })
  return true
}

function originAllowed(origin) {
  if (!origin) return true
  try {
    const u = new URL(origin)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
  } catch { return false }
  return EXTRA_ORIGINS.includes(origin)
}

// ---------- HTTP (health check) + WebSocket ----------
const server = http.createServer(async (req, res) => {
  if (req.url === '/api/health') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ server: true, docker: await dockerStatus() }))
    return
  }
  res.statusCode = 404
  res.end('Not found')
})

const wss = new WebSocketServer({ noServer: true })
server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws' || !originAllowed(req.headers.origin)) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

wss.on('connection', (ws) => {
  let child = null
  let name = null
  let dir = null
  let timer = null
  let counted = false
  let outputSize = 0
  let ended = false
  const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o))

  const cleanup = () => {
    clearTimeout(timer)
    if (name) { const n = name; name = null; spawn('docker', ['rm', '-f', n], { stdio: 'ignore' }).on('error', () => {}) }
    if (child && child.exitCode === null) child.kill()
    child = null
    if (dir) {
      const d = dir
      dir = null
      fs.rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }, () => {})
    }
    if (counted) { counted = false; active-- }
  }

  const finishRun = (code, note) => {
    if (ended) return
    ended = true
    if (note) send({ type: 'out', text: note })
    send({ type: 'done', code })
    cleanup()
  }

  async function run(m) {
    cleanup()
    ended = false
    outputSize = 0
    const L = LANGS[m.lang]
    if (!L || typeof m.code !== 'string') return finishRun(1, 'This language is not supported.\n')
    if (m.code.length > MAX_CODE) return finishRun(1, 'Program is too long.\n')
    if (active >= MAX_RUNS) return finishRun(1, 'The server is busy right now. Please try again in a few seconds.\n')
    active++
    counted = true

    const st = await dockerStatus()
    if (st === 'missing') return finishRun(1, 'Docker is not installed.\n\n' + DOCKER_HELP)
    if (st !== 'ready') return finishRun(1, DOCKER_HELP)
    if (ended || ws.readyState !== 1) return cleanup()
    if (!(await ensureImage(L, send))) return finishRun(1)
    if (ws.readyState !== 1) return cleanup()

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'))
    for (const [file, content] of Object.entries(L.files(m.code))) fs.writeFileSync(path.join(dir, file), content)
    name = 'cr-' + Math.random().toString(36).slice(2, 10)
    const mem = L.mem || '512m'

    const args = [
      'run', '--rm', '-i', '--name', name,
      '--network', 'none',
      '--memory', mem, '--memory-swap', mem,
      '--cpus', '1', '--pids-limit', '512',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--read-only', '--tmpfs', '/tmp:rw,exec,nosuid,size=512m',
      '--user', m.lang === 'csharp' ? '0:0' : '65534:65534',
      '--mount', `type=bind,source=${dir},target=/src,readonly`,
      '-w', '/tmp',
      ...Object.entries(ENV).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      L.image, 'sh', '-c', `mkdir -p /tmp/w && cp -r /src/. /tmp/w && cd /tmp/w && ${L.cmd}`,
    ]

    send({ type: 'started' })
    let p
    try {
      p = spawn('docker', args)
    } catch (e) {
      return finishRun(1, 'Could not start Docker: ' + e.message + '\n')
    }
    child = p
    p.stdout.setEncoding('utf8')
    p.stderr.setEncoding('utf8')
    const forward = (d) => {
      outputSize += d.length
      if (outputSize > MAX_OUTPUT) {
        finishRun(1, '\n[Output too long, program stopped]\n')
        return
      }
      send({ type: 'out', text: d })
    }
    p.stdout.on('data', forward)
    p.stderr.on('data', forward)
    p.stdin.on('error', () => {})
    p.on('error', (e) => finishRun(1, 'Could not start Docker: ' + e.message + '\n'))
    p.on('close', (code) => {
      const note = code === 137 ? '\n[Stopped: the program used too much memory or time]\n' : ''
      finishRun(code, note)
    })
    timer = setTimeout(() => finishRun(1, '\n[Stopped: the program ran for too long]\n'), RUN_TIMEOUT_MS)
  }

  ws.on('message', (raw) => {
    let m
    try { m = JSON.parse(raw) } catch { return }
    if (m.type === 'run') run(m).catch((e) => finishRun(1, 'Server error: ' + e.message + '\n'))
    else if (m.type === 'input') { if (child && child.stdin.writable) child.stdin.write(String(m.text) + '\n') }
    else if (m.type === 'eof') { if (child && child.stdin.writable) child.stdin.end() }
    else if (m.type === 'stop') { ended = true; cleanup() }
  })
  ws.on('close', () => { ended = true; cleanup() })
})

server.listen(PORT, HOST, () => {
  console.log(`Backend ready on http://${HOST}:${PORT}`)
  dockerStatus().then((s) => {
    if (s === 'ready') console.log('Docker: running')
    else console.log('Docker: NOT running. Open Docker Desktop and wait for "Engine running".')
  })
})
