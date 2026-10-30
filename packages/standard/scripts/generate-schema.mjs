import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createGenerator } from 'ts-json-schema-generator'

const root = new URL('../', import.meta.url)
const schema = createGenerator({
  path: fileURLToPath(new URL('src/package/package.type.ts', root)),
  tsconfig: fileURLToPath(new URL('tsconfig.json', root)),
  type: 'Package',
  expose: 'export',
  jsDoc: 'extended',
  additionalProperties: false,
}).createSchema('Package')
await mkdir(new URL('dist/', root), { recursive: true })
await writeFile(new URL('dist/package.schema.json', root), JSON.stringify(schema, null, 2) + '\n')
