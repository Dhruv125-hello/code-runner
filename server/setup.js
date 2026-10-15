// One-time download of everything the compiler needs:  npm run setup
// Optional: only some languages:  npm run setup -- c java python
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGS, KOTLIN_IMAGE } from './languages.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const info = spawnSync('docker', ['info'], { encoding: 'utf8' })
if (info.error || info.status !== 0) {
  console.log('\nDocker is not running (or not installed).')
  console.log('1. Install:  winget install -e --id Docker.DockerDesktop   (then restart your PC)')
  console.log('2. Open "Docker Desktop" and wait until it says "Engine running".')
  console.log('3. Run  npm run setup  again.\n')
  process.exit(1)
}

const wanted = process.argv.slice(2).filter((a) => LANGS[a])
const keys = wanted.length ? wanted : Object.keys(LANGS)
const images = [...new Set(keys.map((k) => LANGS[k].image))]

let failed = 0
images.forEach((img, i) => {
  console.log(`\n[${i + 1}/${images.length}] ${img}`)
  const r =
    img === KOTLIN_IMAGE
      ? spawnSync('docker', ['build', '-t', KOTLIN_IMAGE, path.join(ROOT, 'docker', 'kotlin')], { stdio: 'inherit' })
      : spawnSync('docker', ['pull', img], { stdio: 'inherit' })
  if (r.status !== 0) { failed++; console.log(`  Failed: ${img}`) }
})
console.log(failed ? `\nDone, but ${failed} download(s) failed. Run  npm run setup  again later.\n` : '\nAll set! Now run:  npm start\n')
