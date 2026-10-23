import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const scratch = await mkdtemp(join(root, '.electron-smoke-'))
const nativeTests = process.argv.includes('--native-tests')
const useNode = process.argv.includes('--node')
const executable = useNode ? process.execPath : require('electron')
const args = nativeTests
  ? [
      '--test',
      ...['node-casclib', 'node-stormlib'].flatMap((name) =>
        ['compat', name === 'node-casclib' ? 'storage' : 'archive'].map((test) =>
          join(root, 'packages', name, 'test', `${test}.test.mjs`),
        ),
      ),
    ]
  : [join(root, 'scripts', 'fixtures', 'electron-smoke.mjs'), scratch]
const env = { ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch }
delete env.ELECTRON_RUN_AS_NODE
if (nativeTests) env.ELECTRON_RUN_AS_NODE = '1'
try {
  const child = spawn(executable, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (data) => {
    output += data
    process.stdout.write(data)
  })
  child.stderr.on('data', (data) => process.stderr.write(data))
  const timeout = setTimeout(() => child.kill(), 120_000)
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    assert.equal(code, 0, 'Electron validation exited unsuccessfully')
    if (!nativeTests) assert.ok(output.includes('ELECTRON_SMOKE_OK'))
  } finally {
    clearTimeout(timeout)
  }
} finally {
  await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
