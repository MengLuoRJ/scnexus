import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { Storage, CascLibError, Locale } from '../dist/index.js'

function blte(bytes, compressed = false) {
  const block = Buffer.concat([
    Buffer.from(compressed ? 'Z' : 'N'),
    compressed ? deflateSync(bytes) : bytes,
  ])
  const header = Buffer.alloc(36)
  header.write('BLTE')
  header.writeUInt32BE(36, 4)
  header[8] = 0x0f
  header[11] = 1
  header.writeUInt32BE(block.length, 12)
  header.writeUInt32BE(bytes.length, 16)
  createHash('md5').update(block).digest().copy(header, 20)
  return Buffer.concat([header, block])
}

test('Worker preserves native open failures and validates parameters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'node-casclib-missing-'))
  try {
    await assert.rejects(Storage.open(join(directory, 'missing')), (error) => {
      assert.ok(error instanceof CascLibError)
      assert.equal(typeof error.code, 'number')
      return true
    })
    assert.throws(() => Storage.open('bad\0path'), TypeError)
    await assert.rejects(Storage.open(directory, { locale: -1 }), RangeError)
    assert.equal(Locale.ZHCN, 0x40)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('real CascLib decodes raw and zlib BLTE with limits and Unicode disk paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'node-casclib-blte-'))
  const bytes = Buffer.from('CASC native decoding\n'.repeat(10000))
  try {
    for (const compressed of [false, true]) {
      const path = join(directory, `\u6d4b\u8bd5-${compressed}.blte`)
      await writeFile(path, blte(bytes, compressed))
      assert.deepEqual(await Storage.readLocalFile(path, { strict: true }), bytes)
      await assert.rejects(Storage.readLocalFile(path, { maxBytes: 8 }), RangeError)
    }
    const invalid = join(directory, 'invalid.blte')
    await writeFile(invalid, 'not a BLTE file')
    await assert.rejects(Storage.readLocalFile(invalid))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('native chunked extraction and closed-handle protection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'node-casclib-extract-'))
  const require = createRequire(import.meta.url)
  const binding = require('../build/Release/node_casclib.node')
  const path = join(directory, 'source.blte')
  const target = join(directory, 'extracted.bin')
  const bytes = Buffer.alloc(3 * 1024 * 1024, 0x41)
  await writeFile(path, blte(bytes, true))
  const storage = new binding.Storage(path, { localFile: true })
  try {
    storage.call('extract', [{ type: 'name', value: 'local' }, Locale.ALL, 0x10, target])
    assert.deepEqual(await readFile(target), bytes)
    storage.call('close', [])
    storage.call('close', [])
    assert.throws(
      () => storage.call('read', [{ type: 'name', value: 'local' }, Locale.ALL, 0, 8]),
      /closed/,
    )
  } finally {
    storage.call('close', [])
    await rm(directory, { recursive: true, force: true })
  }
})

test(
  'real local CASC storage metadata, enumeration, reads and queued close',
  {
    skip: process.env.CASCLIB_TEST_STORAGE
      ? false
      : 'Set CASCLIB_TEST_STORAGE to a local game installation',
  },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'node-casclib-real-'))
    const storage = await Storage.open(process.env.CASCLIB_TEST_STORAGE, {
      product: process.env.CASCLIB_TEST_PRODUCT,
    })
    try {
      const info = await storage.getInfo()
      assert.ok(info.totalFileCount > 0)
      const entries = await storage.list()
      assert.ok(entries.length > 0)
      const entry = entries.find(
        (item) => item.available && item.size > 0 && item.size < 4 * 1024 * 1024,
      )
      assert.ok(entry, 'No small locally available file found')
      assert.equal(await storage.hasFile(entry.name), true)
      const bytes = await storage.readFile(entry.name)
      assert.equal(bytes.length, entry.size)
      const destination = join(directory, 'file.bin')
      await storage.extract(entry.name, destination)
      assert.deepEqual(await readFile(destination), bytes)
      await assert.rejects(storage.extract(entry.name, destination))
      await storage.extract(entry.name, destination, { overwrite: true })
      assert.equal((await storage.listTree()).type, 'directory')
      const queued = storage.readFile(entry.name)
      const close = storage.close()
      assert.deepEqual(await queued, bytes)
      await close
      assert.equal(storage.close(), close)
      await assert.rejects(storage.list(), /closed/)
    } finally {
      await storage.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
)
